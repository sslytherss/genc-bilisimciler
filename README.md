# Genç Bilişimciler Topluluğu — Tanıtım Sitesi

Stantta QR kod okutularak açılan, telefon öncelikli, kaydırmalı tanıtım sitesi.
Kaydırdıkça altın devre yollu küp biçim değiştirir:

| # | Bölüm | Küp |
|---|-------|-----|
| 1 | Hoş geldiniz | Bütün küp, yavaşça döner |
| 2 | Şu anda standımızdasınız | Katmanlar Rubik gibi dönüp aralanır |
| 3 | Biz kimiz? | Kamera küpün içine dalar, parçalar saçılır, çekirdek görünür |
| 4 | Misyon & vizyon | Parçalar ışıklı bir ağa dönüşür |
| 5 | Öneri formu | Merkezli topluluk grafiği; öneri gönderilince çekirdek parlar |
| 6 | Üye ol | Her şey yeniden küpte birleşir |

Hareket eden her parça arkasında sönümlenen altın bir iz bırakır. Küp dokuları tarayıcıda
çizilir (görsel dosyası indirilmez); 3D sahne ayrı parça olarak yüklenir, metin anında görünür.
WebGL yoksa konsept görseli arka plan olarak gösterilir.

**Dil:** Üst çubukta TR / EN seçimi var. Telefonun dili Türkçe değilse site İngilizce açılır,
seçim cihazda hatırlanır. Türkçe metinler `index.html`'de, İngilizceler `src/i18n.ts`'te durur.
Topluluk adı özel isim olduğu için her iki dilde de Türkçe yazılır.

## Çalıştırma

Gerekli: Node.js 22.18+ (önerilen 24).

```bash
npm install
cp .env.example .env     # ADMIN_PASSWORD'ü değiştirin
npm run dev              # http://localhost:5173  (API: 3001)
```

Geliştirme sunucusu varsayılan olarak **yalnızca bu bilgisayara** açıktır. Aynı Wi-Fi'daki telefondan
denemek için `npm run dev:lan` kullanın ve Vite'ın yazdığı `Network:` adresini açın. Yurt/kampüs gibi
ortak ağlarda `dev:lan`'ı açık bırakmayın: aynı ağdaki herkes erişebilir.

Production:

```bash
npm run build
npm start                # http://localhost:3001 (site + API tek sunucuda)
```

## Admin paneli

`/admin/` adresi. `.env` içindeki `ADMIN_PASSWORD` ile girilir (en az 12 karakter).

- Gelen önerileri listeleme, arama, silme, CSV indirme (Excel uyumlu)
- En çok istenen konuların dağılımı
- **Ziyaretçiler:** toplam / bugünkü ziyaret, QR ile gelen, sona kadar kaydıran, telefondan gelen;
  bölüm bölüm kaydırma hunisi; öneri, "Üye Ol", LinkedIn, Instagram tıklamaları; dil ve kaynak dağılımı.
  Stant öncesi test ziyaretlerini "Sayaçları sıfırla" ile temizleyin.
- **Üyelik bağlantısı:** son sayfadaki "Üye Ol" butonunun adresi buradan girilir,
  yeniden yayına gerek yoktur. Boşken buton "çok yakında" gösterir.

### QR kod ve stant afişi

Admin panelinde "QR kod ve stant afişi" bölümü:

- **Site adresi** panelin açıldığı adresten otomatik gelir. Domain gelince paneli domain üzerinden açmak yeterli.
  Adres `localhost` ya da yerel ağ adresiyse telefonların açamayacağı konusunda uyarır.
- **Kaynak etiketi** (varsayılan `qr`): farklı yerlere farklı QR basıp hangisinin işe yaradığını görmek için
  (`brosur`, `sunum`…). Ziyaretçiler bölümünde "Kaynak" satırında ayrı sayılır.
- **A4 afişi aç ve yazdır:** küp görseli, "Hoş geldiniz", QR kod, 3 adım ve sosyal medya hesaplarıyla
  hazır afiş. Yazdırma ekranında kağıt A4, kenar boşluğu "Yok", "Arka plan grafikleri" açık olmalı.
  "PDF olarak kaydet" ile matbaaya da gönderilebilir.
- **QR indir (PNG / SVG):** başka tasarımlarda (sunum slaytı, broşür) kullanmak için. SVG her boyutta keskindir.

### Ziyaretçi sayacı ve QR kod

Kişisel veri tutulmaz: IP, çerez, isim veya cihaz parmak izi yok. Her tarayıcı sekmesine rastgele bir
kimlik verilir ve sekme kapanınca silinir; sayfa yenilemek yeni ziyaret sayılmaz. Otomasyon araçları sayılmaz.

**QR kodun adresi `?k=qr` ile bitmeli**, örn. `https://alanadi.edu.tr/?k=qr`. Böylece admin panelinde
"QR okutarak gelen" ayrı sayılır. Bunu elle yapmayın: admin panelindeki **QR kod ve stant afişi** bölümü
doğru adresi kendisi üretir. Parametre adres çubuğundan hemen silinir; link başkasına iletilirse
o ziyaret QR sayılmaz. Farklı yerler için farklı kod kullanılabilir (`?k=afis`, `?k=instagram`…),
panelde "Kaynak" satırında ayrı görünür.

Öneriler `data/gbt.sqlite` dosyasında tutulur (Node'un yerleşik `node:sqlite` modülü; ek veritabanı kurulumu yok).
Bu dosyayı yedekleyin.

## Yayına alma (domain gelince)

Tek bir Node süreci hem siteyi hem API'yi sunar; kalıcı bir disk gerekir (SQLite dosyası için).

**Docker ile (VPS, Render, Railway, Fly.io…):**

```bash
docker build -t gbt-web .
docker run -d -p 3001:3001 -v gbt-data:/data \
  -e ADMIN_PASSWORD='...' -e SESSION_SECRET='...' -e TRUST_PROXY=1 gbt-web
```

Önüne HTTPS sağlayan bir reverse proxy (Caddy / nginx) koyup domaini ona yönlendirin.
Caddy örneği:

```
gbt.ornek.edu.tr {
    reverse_proxy localhost:3001
}
```

Proxy arkasında `TRUST_PROXY` önündeki proxy sayısı olmalı: yalnızca Caddy/nginx → `1`,
Cloudflare + Caddy → `2`. Yanlış ayarda limitler herkesi tek IP sanar ve çerezler `Secure` olmaz.

## Güvenlik notları

- Admin oturumu HMAC imzalı, `HttpOnly` + `SameSite=Strict` çerez; 12 saat geçerli. Çıkış yapılınca
  oturum sunucuda da geçersiz olur (çalınmış bir çerez çıkıştan sonra işe yaramaz).
- Hata yanıtları teknik ayrıntı (dosya yolu, kod satırı) içermez.
- Sunucu varsayılan olarak yalnızca `127.0.0.1`'i dinler; Docker'da `HOST=0.0.0.0`.
- Yazı tipleri kendi sunucumuzdan verilir; site hiçbir dış sunucuya istek atmaz (ziyaretçi IP'si Google'a gitmez).
- Stant afişi yalnızca giriş yapmış admin için üretilir.
- **CVE taraması:** CI her push'ta ve her pazartesi Docker imajını Trivy ile tarar; düzeltmesi yayınlanmış
  YÜKSEK/KRİTİK bir açık varsa kontrol kırmızıya döner ve GitHub e-posta gönderir. `npm audit` ile
  paketler ayrıca kontrol edilebilir.
- Giriş denemeleri IP başına 15 dakikada 10 ile sınırlı.
- **Öneri limiti cihaz başınadır** (10 dakikada 5), çünkü okul Wi-Fi'ında yüzlerce kişi tek IP'yi paylaşır.
  IP başına limit yalnızca sele karşı yüksek bir tavandır (300). Cihaz kimliği rastgeledir, yalnızca bu limit
  için kullanılır ve veritabanına yazılmaz. Test: aynı IP'den aynı anda 200 farklı telefon → 200'ü de kaydedildi.
- Aynı IP'den birebir aynı uzun metin (20+ karakter) 10 dakika içinde tekrar gelirse sessizce yok sayılır
  (kopyala-yapıştır spam). Kısa ortak ifadelere dokunulmaz.
- Limitler `.env`'den değiştirilebilir (`RATE_LIMIT_*`).
- Bilinen sınır: çok sayıda farklı IP'den gelen organize saldırıyı bu önlemler durduramaz. Domain gelince
  Cloudflare arkasına alıp gerekirse Cloudflare Turnstile (görünmez, ücretsiz bot doğrulama) eklenmeli.
- Bot tuzağı (gizli alan), uzunluk sınırları, konu listesi sunucuda doğrulanır.
- CSP ve güvenlik başlıkları; CSV'de Excel formül enjeksiyonu engellenir.

## Kapasite

Tek Node süreci + SQLite (WAL). Geliştirme bilgisayarında (işlemci zaten %44 meşgulken),
100 eşzamanlı bağlantıyla 10'ar saniyelik yük testi, **sıfır hata**:

| İstek | Saniyede | Ortalama gecikme |
|---|---|---|
| Küçük JSON (`/api/config`) | ~5000 | 20 ms |
| Ana sayfa | ~840 | 118 ms |
| Öneri gönderme (veritabanına yazma) | ~1200 | 82 ms |
| Ziyaret kaydı (veritabanına yazma) | ~1340 | 74 ms |

10.000 kişinin aynı anda öneri göndermesi ~8 saniyede tamamen kaydedilir. Admin paneli 12.000 öneriyle
0,7 saniyede açılır (liste en yeni 200 kayıtla sınırlı; arama ve CSV tüm kayıtlarda çalışır).

PostgreSQL'e ancak birden fazla sunucu çalıştırmak gerektiğinde ihtiyaç olur; veritabanı kodu
`server/db.ts`'te tek yerde toplandığı için geçiş kolaydır. Kötü niyetli trafik (DDoS) için önerilen:
domaini Cloudflare (ücretsiz) arkasına almak; statik dosyaları önbelleğe alır ve saldırıyı sunucuya
ulaşmadan karşılar.

## Metinleri düzenleme

- Sayfa metinleri: `index.html` (Türkçe), `src/i18n.ts` (İngilizce)
- Formdaki hızlı seçim konuları: `src/shared/topics.ts` (sunucu da bu listeyle doğrular)
- Küpün bölüm bölüm konumu/davranışı: `src/scene/cube-scene.ts` içindeki `STAGES`
- Renkler ve yazı tipleri: `src/styles/tokens.css`

## Klasör yapısı

```
index.html            ana site (6 bölüm)
admin/index.html      admin paneli
src/main.ts           kaydırma, form, üyelik bağlantısı
src/i18n.ts           TR/EN dil desteği
src/analytics.ts      kişisel veri tutmayan ziyaret sayacı
src/device-id.ts      cihaz başına limit için rastgele kimlik
src/qr.ts, poster.ts  QR üretimi ve A4 stant afişi (admin/afis.html)
src/admin.ts          admin paneli mantığı
src/scene/            3D küp sahnesi + prosedürel devre dokusu
src/shared/topics.ts  site ve sunucunun ortak konu listesi
server/               Express API, SQLite, oturum, rate limit
docs/reference/       konsept görseller
```
