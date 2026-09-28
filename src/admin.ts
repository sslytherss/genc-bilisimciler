import './styles/admin.css';
import { buildQrUrl, qrPngDataUrl, qrSvg, reachabilityWarning } from './qr';

type Suggestion = {
  id: number;
  createdAt: string;
  name: string | null;
  topics: string[];
  message: string;
};

type VisitStats = {
  total: number;
  today: number;
  mobile: number;
  en: number;
  sources: { source: string; count: number }[];
  reach: number[];
  clicks: { join: number; linkedin: number; instagram: number; suggest: number };
};

const SECTION_NAMES = ['Hoş geldiniz', 'Stand', 'Biz kimiz?', 'Misyon & vizyon', 'Öneri formu', 'Üye ol'];
const SOURCE_NAMES: Record<string, string> = { qr: 'QR kod', direct: 'Doğrudan' };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const loginView = $('login-view');
const dashView = $('dash-view');
const logoutBtn = $<HTMLButtonElement>('logout');
const listEl = $('list');
const searchInput = $<HTMLInputElement>('search');
const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });

let suggestions: Suggestion[] = [];
// Binlerce öneride sayfa kilitlenmesin diye liste bu kadarla sınırlı; arama ve CSV tüm kayıtlarda çalışır.
const LIST_LIMIT = 200;
let pollTimer: number | undefined;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && path !== '/api/admin/login') {
    showLogin();
    throw new Error(body.error ?? 'Oturum gerekli.');
  }
  if (!res.ok) throw new Error(body.error ?? `İstek başarısız (${res.status}).`);
  return body;
}

// ── Görünümler ──────────────────────────────────────────────────────

function showLogin(message = '') {
  window.clearInterval(pollTimer);
  dashView.hidden = true;
  logoutBtn.hidden = true;
  loginView.hidden = false;
  $('login-error').textContent = message;
  $<HTMLInputElement>('password').focus();
}

async function showDashboard() {
  loginView.hidden = true;
  dashView.hidden = false;
  logoutBtn.hidden = false;
  await Promise.all([loadSuggestions(), loadStats(), loadSettings()]);
  window.clearInterval(pollTimer);
  // Stand sırasında yeni öneriler ve ziyaretler kendiliğinden gelsin
  pollTimer = window.setInterval(() => {
    if (!document.hidden) Promise.all([loadSuggestions(), loadStats()]).catch(() => {});
  }, 30_000);
}

// ── Veriler ─────────────────────────────────────────────────────────

async function loadSuggestions() {
  const data = await api<{ suggestions: Suggestion[] }>('/api/admin/suggestions');
  suggestions = data.suggestions;
  renderStats();
  renderList();
}

async function loadStats() {
  renderStatsVisits(await api<VisitStats>('/api/admin/stats'));
}

async function loadSettings() {
  const data = await api<{ membershipUrl: string }>('/api/admin/settings');
  $<HTMLInputElement>('membership-url').value = data.membershipUrl;
}

function renderStats() {
  const today = new Date().toDateString();
  $('stat-total').textContent = String(suggestions.length);
  $('stat-today').textContent = `Bugün ${suggestions.filter((s) => new Date(s.createdAt).toDateString() === today).length}`;

  const counts = new Map<string, number>();
  for (const s of suggestions) for (const t of s.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const max = ranked[0]?.[1] ?? 1;

  renderBars(
    $('topic-bars'),
    ranked.map(([topic, n]) => ({ label: topic, value: n, title: `${topic}: ${n} öneri` })),
    max,
  );
  $('topic-empty').hidden = ranked.length > 0;
}

type BarRow = { label: string; value: number; note?: string; title?: string };

/** Tek seri, tek renk yatay çubuklar; değer metin renginde, isteğe bağlı oran notu */
function renderBars(el: HTMLElement, rows: BarRow[], max: number) {
  el.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement('li');
      li.title = row.title ?? `${row.label}: ${row.value}`;
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: row.label });
      const track = Object.assign(document.createElement('span'), { className: 'track' });
      const fill = Object.assign(document.createElement('span'), { className: 'fill' });
      fill.style.display = 'block';
      fill.style.width = `${max > 0 ? (row.value / max) * 100 : 0}%`;
      if (row.value === 0) fill.style.minWidth = '0';
      track.append(fill);
      const value = Object.assign(document.createElement('span'), { className: 'value', textContent: String(row.value) });
      if (row.note) value.append(Object.assign(document.createElement('small'), { textContent: row.note }));
      li.append(name, track, value);
      return li;
    }),
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? `%${Math.round((part / whole) * 100)}` : '—');

function renderStatsVisits(v: VisitStats) {
  const qr = v.sources.find((s) => s.source === 'qr')?.count ?? 0;
  const complete = v.reach[v.reach.length - 1] ?? 0;
  $('v-total').textContent = String(v.total);
  $('v-today').textContent = `Bugün ${v.today}`;
  $('v-qr').textContent = String(qr);
  $('v-qr-share').textContent = `Ziyaretlerin ${pct(qr, v.total)}’i`;
  $('v-complete').textContent = String(complete);
  $('v-complete-share').textContent = `Ziyaretlerin ${pct(complete, v.total)}’i`;
  $('v-mobile').textContent = String(v.mobile);
  $('v-mobile-share').textContent = `Ziyaretlerin ${pct(v.mobile, v.total)}’i`;

  renderBars(
    $('funnel'),
    v.reach.map((n, i) => ({
      label: `${i + 1}. ${SECTION_NAMES[i]}`,
      value: n,
      note: pct(n, v.total),
      title: `${SECTION_NAMES[i]} bölümüne ulaşan: ${n} (${pct(n, v.total)})`,
    })),
    v.total,
  );

  const clicks = [
    { label: 'Öneri gönderdi', value: v.clicks.suggest },
    { label: 'Üye Ol', value: v.clicks.join },
    { label: 'LinkedIn', value: v.clicks.linkedin },
    { label: 'Instagram', value: v.clicks.instagram },
  ];
  renderBars(
    $('clicks'),
    clicks.map((c) => ({ ...c, note: pct(c.value, v.total) })),
    Math.max(1, ...clicks.map((c) => c.value)),
  );

  $('v-lang').textContent = v.total ? `Türkçe ${v.total - v.en} · İngilizce ${v.en}` : '—';
  $('v-sources').textContent = v.sources.length
    ? v.sources.map((s) => `${SOURCE_NAMES[s.source] ?? s.source} ${s.count}`).join(' · ')
    : '—';
}

function renderList() {
  const q = searchInput.value.trim().toLocaleLowerCase('tr');
  const visible = q
    ? suggestions.filter((s) =>
        [s.message, s.name ?? '', ...s.topics].some((v) => v.toLocaleLowerCase('tr').includes(q)),
      )
    : suggestions;

  $('list-empty').hidden = suggestions.length > 0;
  const more = $('list-more');
  more.hidden = visible.length <= LIST_LIMIT;
  more.textContent = `${visible.length} sonuçtan en yeni ${LIST_LIMIT} tanesi gösteriliyor. Daraltmak için arayın ya da tümü için CSV indirin.`;
  listEl.replaceChildren(
    ...visible.slice(0, LIST_LIMIT).map((s) => {
      const li = document.createElement('li');
      li.className = 'item';

      const meta = document.createElement('p');
      meta.className = 'item__meta';
      const who = document.createElement('b');
      who.textContent = s.name || 'Anonim';
      meta.append(who, ` · ${dateFmt.format(new Date(s.createdAt))}`);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'item__delete';
      del.textContent = 'Sil';
      del.addEventListener('click', async () => {
        if (!confirm('Bu öneri kalıcı olarak silinsin mi?')) return;
        try {
          await api(`/api/admin/suggestions/${s.id}`, { method: 'DELETE' });
          suggestions = suggestions.filter((x) => x.id !== s.id);
          renderStats();
          renderList();
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Silinemedi.');
        }
      });

      li.append(meta, del);

      if (s.topics.length) {
        const topics = document.createElement('ul');
        topics.className = 'item__topics';
        topics.append(...s.topics.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
        li.append(topics);
      }
      if (s.message) {
        const msg = document.createElement('p');
        msg.className = 'item__message';
        msg.textContent = s.message;
        li.append(msg);
      }
      return li;
    }),
  );
}

// ── Olaylar ─────────────────────────────────────────────────────────

$<HTMLFormElement>('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('password');
  $('login-error').textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: input.value }) });
    input.value = '';
    await showDashboard();
  } catch (err) {
    $('login-error').textContent = err instanceof Error ? err.message : 'Giriş başarısız.';
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  suggestions = [];
  listEl.replaceChildren();
  showLogin();
});

$<HTMLFormElement>('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('settings-status');
  const input = $<HTMLInputElement>('membership-url');
  try {
    const data = await api<{ membershipUrl: string }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ membershipUrl: input.value }),
    });
    input.value = data.membershipUrl;
    status.dataset.state = 'ok';
    status.textContent = data.membershipUrl ? 'Kaydedildi. “Üye Ol” butonu artık aktif.' : 'Kaydedildi. Buton “çok yakında” gösterecek.';
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = err instanceof Error ? err.message : 'Kaydedilemedi.';
  }
});

let searchTimer: number | undefined;
searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(renderList, 150);
});
$('refresh').addEventListener('click', () => Promise.all([loadSuggestions(), loadStats()]).catch(() => {}));

$('reset-visits').addEventListener('click', async () => {
  const question = 'Tüm ziyaret sayaçları sıfırlansın mı? Öneriler silinmez.\n\nStant öncesi test ziyaretlerini temizlemek için kullanın.';
  if (!confirm(question)) return;
  try {
    await api('/api/admin/visits', { method: 'DELETE' });
    await loadStats();
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Sıfırlanamadı.');
  }
});

// ── QR kod ve afiş ──────────────────────────────────────────────────

const QR_BASE_KEY = 'gbt-qr-base';
const qrBase = $<HTMLInputElement>('qr-base');
const qrSource = $<HTMLInputElement>('qr-source');
const qrButtons = ['qr-poster', 'qr-png', 'qr-svg'].map((id) => $<HTMLButtonElement>(id));
let qrUrl: string | null = null;

try {
  qrBase.value = localStorage.getItem(QR_BASE_KEY) ?? location.origin;
} catch {
  qrBase.value = location.origin;
}

async function renderQr() {
  // Sunucu yalnızca küçük harf, rakam ve tire kabul eder
  const source = qrSource.value
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]!)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24);
  if (source !== qrSource.value) qrSource.value = source;
  const url = buildQrUrl(qrBase.value, source);
  qrUrl = url;

  $('qr-url').textContent = url ?? 'Geçerli bir adres girin (https://…)';
  const warning = url ? reachabilityWarning(url) : null;
  $('qr-warning').hidden = !warning;
  $('qr-warning').textContent = warning ?? '';
  qrButtons.forEach((b) => (b.disabled = !url));
  try {
    localStorage.setItem(QR_BASE_KEY, qrBase.value);
  } catch {
    /* önemli değil */
  }

  const svg = url ? await qrSvg(url) : '';
  if (url === qrUrl) $('qr-preview').innerHTML = svg; // yazarken eski sonuç yenisini ezmesin
}

function download(href: string, filename: string) {
  const a = Object.assign(document.createElement('a'), { href, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

const qrFileName = () => `gbt-qr-${qrSource.value || 'site'}`;

qrBase.addEventListener('input', renderQr);
qrSource.addEventListener('input', renderQr);
$('qr-png').addEventListener('click', async () => {
  if (qrUrl) download(await qrPngDataUrl(qrUrl), `${qrFileName()}.png`);
});
$('qr-svg').addEventListener('click', async () => {
  if (!qrUrl) return;
  const blobUrl = URL.createObjectURL(new Blob([await qrSvg(qrUrl)], { type: 'image/svg+xml' }));
  download(blobUrl, `${qrFileName()}.svg`);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
});
$('qr-poster').addEventListener('click', () => {
  if (qrUrl) window.open(`/admin/afis.html?u=${encodeURIComponent(qrUrl)}`, '_blank', 'noopener');
});
renderQr();

// ── Başlangıç ───────────────────────────────────────────────────────

api<{ authenticated: boolean; enabled: boolean }>('/api/admin/me')
  .then((me) => {
    if (me.authenticated) return showDashboard();
    showLogin(me.enabled ? '' : 'Sunucuda ADMIN_PASSWORD tanımlı değil; giriş kapalı.');
  })
  .catch(() => showLogin('Sunucuya ulaşılamadı.'));
