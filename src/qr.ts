import QRCode from 'qrcode';

/** QR kodlar her zaman açık zemin üzerine koyu modül: her telefon kamerası güvenle okur. */
const COLORS = { dark: '#0b0b0d', light: '#ffffff' };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: COLORS });
}

export function qrPngDataUrl(url: string, width = 1200): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width, color: COLORS });
}

/** Site adresine kaynak etiketini ekler: https://alan.adi/?k=qr */
export function buildQrUrl(base: string, source: string): string | null {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  if (source) url.searchParams.set('k', source);
  return url.toString();
}

/** Adres telefonlardan erişilebilir mi? Uyarı metni döner (sorun yoksa null). */
export function reachabilityWarning(url: string): string | null {
  const { hostname, protocol } = new URL(url);
  if (hostname === 'localhost' || hostname.startsWith('127.') || hostname === '[::1]') {
    return 'Bu adres yalnızca bu bilgisayarda açılır; telefonlar okuttuğunda sayfa açılmaz. Domain gelince paneli domain üzerinden açın ya da deneme için bilgisayarın ağ adresini yazın.';
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) {
    return 'Bu yerel ağ adresi yalnızca aynı Wi-Fi’daki telefonlarda çalışır. Denemek için uygun, afiş için domain adresini kullanın.';
  }
  if (protocol === 'http:') {
    return 'Adres https:// ile başlamıyor. Domain kurulunca https adresini kullanın; bazı telefonlar güvensiz bağlantı uyarısı gösterir.';
  }
  return null;
}
