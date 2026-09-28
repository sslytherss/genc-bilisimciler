import './styles/poster.css';
import { qrSvg } from './qr';

const raw = new URLSearchParams(location.search).get('u') ?? '';
let url: URL | null = null;
try {
  url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') url = null;
} catch {
  url = null;
}

const sheet = document.getElementById('sheet')!;
const printBtn = document.getElementById('print') as HTMLButtonElement;

function fail(message: string) {
  sheet.hidden = true;
  printBtn.disabled = true;
  const error = document.getElementById('error')!;
  error.textContent = message;
  error.hidden = false;
}

// Afiş yalnızca giriş yapmış admin için üretilir: aksi hâlde biri sitemizin adresiyle
// başka bir linke giden "resmî görünümlü" afiş hazırlayabilirdi.
fetch('/api/admin/me')
  .then((r) => r.json() as Promise<{ authenticated: boolean }>)
  .then(async (me) => {
    if (!me.authenticated) return fail('Afiş oluşturmak için önce admin paneline giriş yapın.');
    if (!url) return fail('Geçersiz adres. Afişi admin panelindeki “A4 afişi aç ve yazdır” düğmesiyle açın.');
    document.getElementById('host')!.textContent = url.host;
    document.getElementById('qr')!.innerHTML = await qrSvg(url.toString());
    sheet.hidden = false;
    printBtn.disabled = false;
  })
  .catch(() => fail('Sunucuya ulaşılamadı.'));

printBtn.addEventListener('click', async () => {
  // Yazı tipleri ve görsel yüklenmeden yazdırılırsa afiş eksik çıkar
  await document.fonts.ready;
  window.print();
});
