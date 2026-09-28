import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { LIMITS, TOPICS } from '../src/shared/topics.ts';
import { createAuth } from './auth.ts';
import { SECTION_COUNT, VISIT_EVENTS, openStore, type VisitEvent } from './db.ts';
import { rateLimit } from './rate-limit.ts';

const PORT = Number(process.env.PORT ?? 3001);
// Varsayılan yalnızca bu bilgisayar: ortak Wi-Fi'da (yurt, kampüs) geliştirme sunucusu dışarıya açılmasın.
// Docker/sunucuda HOST=0.0.0.0 verilir (Dockerfile'da ayarlı).
const HOST = process.env.HOST ?? '127.0.0.1';
const DIST_DIR = resolve(import.meta.dirname, '../dist');
const MEMBERSHIP_URL_KEY = 'membershipUrl';

// 10 dakikalık limitler. Okul/kampüs Wi-Fi'ında yüzlerce kişi TEK IP'den gelir (ör. sunumda QR
// perdeye yansıtıldığında). Bu yüzden asıl sınır CİHAZ başınadır (tarayıcının rastgele kimliği);
// IP limiti yalnızca tek kaynaktan gelen sele karşı yüksek bir tavandır. .env'den değiştirilebilir.
const WINDOW_MS = 10 * 60_000;
const SUGGESTIONS_PER_DEVICE = Number(process.env.RATE_LIMIT_SUGGESTIONS_PER_DEVICE ?? 5);
const SUGGESTIONS_PER_IP = Number(process.env.RATE_LIMIT_SUGGESTIONS ?? 300);
const VISIT_REQUESTS_PER_DEVICE = Number(process.env.RATE_LIMIT_VISITS_PER_DEVICE ?? 60);
const VISIT_REQUESTS_PER_IP = Number(process.env.RATE_LIMIT_VISITS ?? 5000);
// Bu uzunluktan uzun, aynı IP'den birebir aynı metin pencere içinde tekrar gelirse sessizce yok sayılır
// (kopyala-yapıştır spam). Kısa ifadeleri ("hackathon olsun") farklı kişiler de yazabileceği için dokunulmaz.
const DUPLICATE_MIN_LENGTH = 20;
const VISIT_ID = /^[0-9a-f]{32}$/;
const SOURCE = /^[a-z0-9-]{1,24}$/;

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  console.warn('[uyarı] ADMIN_PASSWORD tanımlı değil — admin paneli girişi kapalı.');
} else if (adminPassword.length < 12) {
  console.error('[hata] ADMIN_PASSWORD en az 12 karakter olmalı.');
  process.exit(1);
}

const store = openStore(process.env.DATABASE_PATH ?? resolve(import.meta.dirname, '../data/gbt.sqlite'));
const auth = createAuth(adminPassword, process.env.SESSION_SECRET);

const app = express();
app.disable('x-powered-by');
// Önündeki reverse proxy sayısı (Caddy = 1, Cloudflare + Caddy = 2). Yanlış ayar, IP limitlerini bozar.
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (trustProxy > 0) app.set('trust proxy', trustProxy);

app.use((req, res, next) => {
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.use('/api', express.json({ limit: '8kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── Herkese açık uçlar ──────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({ membershipUrl: store.getSetting(MEMBERSHIP_URL_KEY) ?? '' });
});

const deviceOf = (req: express.Request): string | null => {
  const id = (req.body as Record<string, unknown> | undefined)?.device;
  return typeof id === 'string' && VISIT_ID.test(id) ? id : null;
};

const recentMessages = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, at] of recentMessages) if (at < cutoff) recentMessages.delete(k);
}, WINDOW_MS).unref();

/** Aynı IP'den aynı uzun metin yakın zamanda geldiyse true (ve kaydı tazeler). */
function isDuplicate(ip: string, message: string): boolean {
  if (message.length < DUPLICATE_MIN_LENGTH) return false;
  const normalized = message.toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  const key = createHash('sha256').update(`${ip}\n${normalized}`).digest('base64url');
  const seen = recentMessages.get(key);
  recentMessages.set(key, Date.now());
  return seen !== undefined && Date.now() - seen < WINDOW_MS;
}

app.post(
  '/api/suggestions',
  rateLimit({
    windowMs: WINDOW_MS,
    max: SUGGESTIONS_PER_IP,
    message: 'Bu ağdan çok fazla gönderim yapıldı, biraz sonra tekrar deneyin.',
  }),
  rateLimit({
    windowMs: WINDOW_MS,
    max: SUGGESTIONS_PER_DEVICE,
    message: 'Kısa sürede çok fazla gönderim yaptınız, biraz sonra tekrar deneyin.',
    // Cihaz kimliği göndermeyen istemciler (el yapımı betikler) IP'leriyle aynı küçük limite tabi olur
    key: (req) => deviceOf(req) ?? `ip:${req.ip}`,
  }),
  (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Bal küpü alanı: gerçek kullanıcılar bu gizli alanı görmez, botlar doldurur.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      res.status(201).json({ ok: true });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, LIMITS.name) : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const topics = Array.isArray(body.topics)
      ? [...new Set(body.topics.filter((t): t is string => (TOPICS as readonly string[]).includes(t as string)))]
      : [];

    if (message.length > LIMITS.message) {
      res.status(400).json({ error: `Mesaj en fazla ${LIMITS.message} karakter olabilir.` });
      return;
    }
    if (topics.length === 0 && message.length < 3) {
      res.status(400).json({ error: 'Lütfen bir konu seçin ya da birkaç kelime yazın.' });
      return;
    }

    // Kopya spam'e de başarı dönülür: gönderen fark etmez, veritabanı kirlenmez
    if (!isDuplicate(req.ip ?? '', message)) store.addSuggestion(name || null, topics, message);
    res.status(201).json({ ok: true });
  },
);

// Ziyaret sayacı (kişisel veri yok: rastgele sekme kimliği, IP saklanmaz)
const visitLimiters = [
  rateLimit({ windowMs: WINDOW_MS, max: VISIT_REQUESTS_PER_IP, message: 'Çok fazla istek.' }),
  rateLimit({
    windowMs: WINDOW_MS,
    max: VISIT_REQUESTS_PER_DEVICE,
    message: 'Çok fazla istek.',
    key: (req) => {
      const id = req.params.id ?? (req.body as Record<string, unknown> | undefined)?.id;
      return typeof id === 'string' && VISIT_ID.test(id) ? `v:${id}` : null;
    },
  }),
];

app.post('/api/visits', ...visitLimiters, (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.id !== 'string' || !VISIT_ID.test(body.id)) {
    res.status(400).json({ error: 'Geçersiz istek.' });
    return;
  }
  const source = typeof body.source === 'string' && SOURCE.test(body.source) ? body.source : 'direct';
  const lang = body.lang === 'en' ? 'en' : 'tr';
  const device = body.device === 'mobile' ? 'mobile' : 'desktop';
  store.addVisit(body.id, source, lang, device);
  res.status(204).end();
});

app.post('/api/visits/:id', ...visitLimiters, (req, res) => {
  const id = String(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!VISIT_ID.test(id)) {
    res.status(400).json({ error: 'Geçersiz istek.' });
    return;
  }
  const section = body.section;
  if (typeof section === 'number' && Number.isInteger(section) && section >= 0 && section < SECTION_COUNT) {
    store.reachSection(id, section);
  }
  if (typeof body.event === 'string' && body.event in VISIT_EVENTS) {
    store.markVisitEvent(id, body.event as VisitEvent);
  }
  res.status(204).end();
});

// ── Admin uçları ────────────────────────────────────────────────────

app.post(
  '/api/admin/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }),
  (req, res) => {
    if (!auth.enabled) {
      res.status(503).json({ error: 'Admin girişi yapılandırılmamış (ADMIN_PASSWORD).' });
      return;
    }
    if (!auth.checkPassword((req.body as Record<string, unknown> | undefined)?.password)) {
      res.status(401).json({ error: 'Şifre hatalı.' });
      return;
    }
    auth.startSession(req, res);
    res.json({ ok: true });
  },
);

app.post('/api/admin/logout', (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: auth.isAuthenticated(req), enabled: auth.enabled });
});

app.get('/api/admin/suggestions', auth.requireAdmin, (_req, res) => {
  res.json({ suggestions: store.listSuggestions() });
});

app.get('/api/admin/suggestions.csv', auth.requireAdmin, (_req, res) => {
  const rows = store.listSuggestions();
  const cell = (value: string) => {
    // Excel formül enjeksiyonunu önlemek için =,+,-,@ ile başlayan hücrelerin önüne ' eklenir.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const lines = [
    ['Tarih', 'İsim', 'Konular', 'Mesaj'].map(cell).join(';'),
    ...rows.map((r) => [r.createdAt, r.name ?? '', r.topics.join(', '), r.message].map(cell).join(';')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="oneriler.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

app.delete('/api/admin/suggestions/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !store.deleteSuggestion(id)) {
    res.status(404).json({ error: 'Kayıt bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/admin/stats', auth.requireAdmin, (_req, res) => {
  res.json(store.visitStats());
});

app.delete('/api/admin/visits', auth.requireAdmin, (_req, res) => {
  store.clearVisits();
  res.json({ ok: true });
});

app.get('/api/admin/settings', auth.requireAdmin, (_req, res) => {
  res.json({ membershipUrl: store.getSetting(MEMBERSHIP_URL_KEY) ?? '' });
});

app.put('/api/admin/settings', auth.requireAdmin, (req, res) => {
  const raw = (req.body as Record<string, unknown> | undefined)?.membershipUrl;
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (url !== '') {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: 'Geçerli bir bağlantı girin.' });
      return;
    }
    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Bağlantı https:// ile başlamalı.' });
      return;
    }
  }
  store.setSetting(MEMBERSHIP_URL_KEY, url);
  res.json({ membershipUrl: url });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Bulunamadı.' });
});

// ── Derlenmiş site (production) ─────────────────────────────────────

if (existsSync(DIST_DIR)) {
  app.use(
    '/assets',
    express.static(resolve(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y' }),
  );
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
}

// Hata yanıtları teknik ayrıntı (dosya yolu, kod satırı) içermez; ayrıntı yalnızca sunucu günlüğüne yazılır.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: 'Geçersiz istek.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası.' });
});

app.listen(PORT, HOST, () => {
  console.log(`GBT sunucusu http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} adresinde çalışıyor`);
});
