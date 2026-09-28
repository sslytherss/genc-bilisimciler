/**
 * Bu tarayıcıya ait rastgele kimlik. Yalnızca sunucudaki "cihaz başına gönderim" limitinde
 * kullanılır; veritabanına yazılmaz, kişiyle ilişkilendirilmez. Okul Wi-Fi'ında yüzlerce kişi
 * aynı IP'yi paylaştığı için limit IP'ye değil cihaza göre uygulanır.
 */
const STORAGE_KEY = 'gbt-device';
let cached: string | null = null;

export function randomId(): string {
  // crypto.randomUUID yalnızca HTTPS'te var; getRandomValues her yerde çalışır
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function deviceId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
    if (!cached || !/^[0-9a-f]{32}$/.test(cached)) {
      cached = randomId();
      localStorage.setItem(STORAGE_KEY, cached);
    }
  } catch {
    cached ??= randomId();
  }
  return cached;
}
