/**
 * TR / EN dil desteği.
 *
 * Türkçe metinler index.html'de durur (varsayılan dil, arama motorları ve JS'siz görünüm için).
 * Sayfa açılırken işaretli öğelerin Türkçe hâli okunup saklanır; burada yalnızca İngilizceler
 * ve JS'in ürettiği dinamik metinler (form mesajları, konu etiketleri…) tutulur.
 *
 * İşaretler:  data-i18n="anahtar"             → textContent
 *             data-i18n-html="anahtar"        → innerHTML (yalnızca bu dosyadaki sabit metinler)
 *             data-i18n-placeholder="anahtar" → placeholder
 *             data-i18n-aria="anahtar"        → aria-label
 */

export type Lang = 'tr' | 'en';

const STORAGE_KEY = 'gbt-lang';

const EN: Record<string, string> = {
  'nav.top': 'Back to top',
  'nav.sections': 'Sections',
  'nav.next': 'Next section',
  'nav.s1': 'Welcome',
  'nav.s2': 'Our stand',
  'nav.s3': 'Who are we?',
  'nav.s4': 'Mission and vision',
  'nav.s5': 'Your ideas',
  'nav.s6': 'Join us',

  'hero.name3': 'Topluluğu',
  'hero.welcome': 'Welcome.',
  'hero.lead': 'Where young people who build, research and share come together. Scroll to see what’s inside the cube.',
  'hero.scroll': 'Scroll',

  'stand.eyebrow': 'You are here',
  'stand.title': 'You’re at our stand right now',
  'stand.lead': 'The moment you scanned the QR code, you stepped through our community’s door. On this short journey:',
  'stand.s1.title': 'Get to know us',
  'stand.s1.text': 'Read who we are and why we exist.',
  'stand.s2.title': 'Share your idea',
  'stand.s2.text': 'Tell us what you’d like to see at our next event.',
  'stand.s3.title': 'Join us',
  'stand.s3.text': 'Let’s leave a mark on the future together.',
  'stand.note': 'Have a question? Feel free to ask our team at the stand.',

  'who.eyebrow': 'Entering the cube',
  'who.title': 'Who are we?',
  'who.lead': 'What is our mission, and where is our vision headed?<br />The answer is one scroll away.',

  'mv.eyebrow': 'Who we are',
  'mv.statement': 'We are a community of students passionate about IT and technology, who <em>learn, build and share</em>.',
  'mv.mission.title': 'Our mission',
  'mv.mission.text':
    'To support students’ academic, technical and personal growth, and to reinforce theory through hands-on projects, research and industry-focused work.',
  'mv.vision.title': 'Our vision',
  'mv.vision.text':
    'To be more than an event organiser: a sustainable community that builds, researches, innovates and adds value to the tech ecosystem.',
  'mv.gain.title': 'What you gain',
  'mv.gain.text':
    'Experience in teamwork, leadership, project management and entrepreneurship, plus the chance to meet the industry through our partnerships with companies, public institutions, technoparks and universities.',
  'mv.fields.title': 'Our fields',
  'field.ai': 'Artificial Intelligence',
  'field.software': 'Software Development',
  'field.security': 'Cyber Security',
  'field.data': 'Data Science',
  'field.cloud': 'Cloud Computing',
  'field.vr': 'Virtual Reality',
  'field.autonomous': 'Autonomous Systems',
  'field.iot': 'Internet of Things',
  'field.mobile': 'Mobile Apps',
  'field.web': 'Web Technologies',
  'field.robotics': 'Robotics',
  'field.design': 'Digital Design',

  'form.eyebrow': 'Your turn',
  'form.title': 'What would you like to see at our next event?',
  'form.quick': 'Quick pick',
  'form.messageLabel': 'Or put it in your own words',
  'form.placeholder': 'e.g. A hands-on AI project workshop…',
  'form.nameLabel': 'Your name',
  'form.optional': '(optional)',
  'form.submit': 'Send',
  'form.privacy': 'Only the community admins can see what you write.',
  'form.thanksTitle': 'Thank you!',
  'form.thanksText': 'Your idea has reached us. We’re shaping the next event together.',
  'form.again': 'Add another idea',

  'join.eyebrow': 'Final step',
  'join.title': 'Are you ready to leave a mark on the future with us?',
  'join.lead': 'Take part in projects, help design our events and play an active role in the world of technology.',
  'join.follow': 'Follow us',
  'join.top': 'Back to top ↑',
};

/** JS'in ürettiği metinler (her iki dil) */
const DYNAMIC = {
  tr: {
    'meta.title': 'Genç Bilişimciler Topluluğu',
    'form.needInput': 'Lütfen bir konu seçin ya da birkaç kelime yazın.',
    'form.tooLong': 'Mesaj en fazla {n} karakter olabilir.',
    'form.sending': 'Gönderiliyor…',
    'form.rateLimited': 'Çok fazla gönderim yapıldı, lütfen biraz sonra tekrar deneyin.',
    'form.failed': 'Gönderilemedi, lütfen tekrar deneyin.',
    'join.soon': 'Üyelik formu çok yakında',
    'join.soonNote': 'Şimdilik standdaki ekibimize adınızı bırakabilirsiniz.',
    'join.open': 'Üye Ol',
    'join.openNote': 'Form yeni sekmede açılır.',
  },
  en: {
    'meta.title': 'Genç Bilişimciler Topluluğu · Young IT Community',
    'form.needInput': 'Please pick a topic or write a few words.',
    'form.tooLong': 'Your message can be at most {n} characters.',
    'form.sending': 'Sending…',
    'form.rateLimited': 'Too many submissions, please try again in a little while.',
    'form.failed': 'Couldn’t send, please try again.',
    'join.soon': 'Membership form coming soon',
    'join.soonNote': 'For now, you can leave your name with our team at the stand.',
    'join.open': 'Join us',
    'join.openNote': 'The form opens in a new tab.',
  },
} as const;

type DynamicKey = keyof (typeof DYNAMIC)['tr'];

/** Öneri konularının İngilizcesi (sunucuya her zaman Türkçe anahtar gider) */
const TOPIC_EN: Record<string, string> = {
  'Yapay Zekâ': 'Artificial Intelligence',
  'Siber Güvenlik / CTF': 'Cyber Security / CTF',
  Hackathon: 'Hackathon',
  'Yazılım Atölyesi': 'Software Workshop',
  'Robotik & IoT': 'Robotics & IoT',
  'Sektörden Konuşmacı': 'Industry Speaker',
  'Kariyer & Staj': 'Career & Internships',
  'Teknik Gezi': 'Technical Trip',
};

type Binding = { el: HTMLElement; attr: 'text' | 'html' | 'placeholder' | 'aria-label'; key: string; tr: string };

const bindings: Binding[] = [];
const listeners: Array<(lang: Lang) => void> = [];
let current: Lang = 'tr';

function collect() {
  const specs = [
    ['data-i18n', 'text'],
    ['data-i18n-html', 'html'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria', 'aria-label'],
  ] as const;
  for (const [data, attr] of specs) {
    document.querySelectorAll<HTMLElement>(`[${data}]`).forEach((el) => {
      const key = el.getAttribute(data)!;
      const tr =
        attr === 'text' ? el.textContent!.trim().replace(/\s+/g, ' ')
        : attr === 'html' ? el.innerHTML.trim()
        : el.getAttribute(attr) ?? '';
      if (!(key in EN)) console.warn(`[i18n] İngilizcesi eksik: ${key}`);
      bindings.push({ el, attr, key, tr });
    });
  }
}

function apply() {
  for (const b of bindings) {
    const value = current === 'en' ? (EN[b.key] ?? b.tr) : b.tr;
    if (b.attr === 'text') b.el.textContent = value;
    else if (b.attr === 'html') b.el.innerHTML = value;
    else b.el.setAttribute(b.attr, value);
  }
  document.documentElement.lang = current;
  document.title = t('meta.title');
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
  });
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tr' || saved === 'en') return saved;
  } catch {
    /* gizli sekme vb. */
  }
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function initI18n() {
  collect();
  current = detect();
  apply();
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang as Lang));
  });
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* kaydedilemese de dil değişir */
  }
  apply();
  listeners.forEach((fn) => fn(lang));
}

export function getLang(): Lang {
  return current;
}

export function onLangChange(fn: (lang: Lang) => void) {
  listeners.push(fn);
}

export function t(key: DynamicKey, vars: Record<string, string | number> = {}): string {
  return DYNAMIC[current][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function topicLabel(topic: string): string {
  return current === 'en' ? (TOPIC_EN[topic] ?? topic) : topic;
}
