/**
 * Kişisel veri tutmayan ziyaret sayacı.
 *
 * - Çerez, IP, parmak izi yok. Her sekmeye rastgele bir kimlik verilir (sessionStorage),
 *   sekme kapanınca kaybolur; yenilemeler aynı ziyaret sayılır.
 * - QR kodun adresi `?k=qr` ile biter; böylece "QR ile gelen" ayrı sayılır. Parametre adres
 *   çubuğundan hemen silinir, link başkasına iletilirse o ziyaret QR sayılmaz.
 * - Gönderilenler: kaynak, dil, cihaz türü (mobil/masaüstü), ulaşılan en son bölüm,
 *   "Üye Ol" / sosyal medya tıklaması, öneri gönderip göndermediği.
 */

import { randomId } from './device-id';

export type TrackEvent = 'join' | 'linkedin' | 'instagram' | 'suggest';

const SESSION_KEY = 'gbt-visit';
let visitId: string | null = null;
let maxSection = -1;
const sent = new Set<TrackEvent>();

function send(path: string, body: object) {
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function startVisit(lang: string) {
  // Otomasyon araçları (testler, botlar) sayılmaz
  if (navigator.webdriver) return;

  const url = new URL(location.href);
  const source = url.searchParams.get('k') ?? 'direct';
  if (url.searchParams.has('k')) {
    url.searchParams.delete('k');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  try {
    visitId = sessionStorage.getItem(SESSION_KEY);
    if (visitId) return; // aynı sekmede yenileme: yeni ziyaret sayma
    visitId = randomId();
    sessionStorage.setItem(SESSION_KEY, visitId);
  } catch {
    visitId = randomId();
  }

  const device = window.matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  send('/api/visits', { id: visitId, source, lang, device });
}

/** Ziyaretçinin ulaştığı en ileri bölüm (0–5). Yalnızca ilerleyince gönderilir. */
export function reachSection(index: number) {
  if (!visitId || index <= maxSection) return;
  maxSection = index;
  send(`/api/visits/${visitId}`, { section: index });
}

export function track(event: TrackEvent) {
  if (!visitId || sent.has(event)) return;
  sent.add(event);
  send(`/api/visits/${visitId}`, { event });
}
