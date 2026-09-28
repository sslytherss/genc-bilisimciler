import './styles/main.css';
import { reachSection, startVisit, track } from './analytics';
import { deviceId } from './device-id';
import { getLang, initI18n, onLangChange, t, topicLabel } from './i18n';
import { LIMITS, TOPICS } from './shared/topics';
import type { CubeScene } from './scene/cube-scene';

const root = document.documentElement;
root.classList.add('js');
initI18n();
startVisit(getLang());

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const panels = [...document.querySelectorAll<HTMLElement>('.panel')];
const dots = [...document.querySelectorAll<HTMLAnchorElement>('.dots a')];
const counter = document.getElementById('counter-current')!;

// ── 3D sahne (ayrı parça olarak yüklenir, metin hemen görünür) ──────

let scene: CubeScene | null = null;
const canvas = document.getElementById('scene') as HTMLCanvasElement;

import('./scene/cube-scene')
  .then(({ createCubeScene }) => {
    scene = createCubeScene(canvas, { reducedMotion });
    scene.setProgress(scrollProgress());
    requestAnimationFrame(() => document.body.classList.add('scene-ready'));
  })
  .catch((err) => {
    console.warn('3D sahne başlatılamadı, yedek görünüm kullanılıyor.', err);
    document.body.classList.add('no-webgl');
  });

// ── Kaydırma ilerlemesi ─────────────────────────────────────────────
// Her bölüm "tam görünür" iken ilerleme o bölümün numarasında sabit kalır; ekrandan
// uzun bölümlerde (ör. misyon/vizyon) okurken küp erkenden biçim değiştirmez.

let tops: number[] = [];
let heights: number[] = [];

function measure() {
  tops = panels.map((p) => p.offsetTop);
  heights = panels.map((p) => p.offsetHeight);
}

function scrollProgress(): number {
  const y = window.scrollY;
  const vh = window.innerHeight;
  for (let i = 0; i < panels.length - 1; i++) {
    const holdEnd = tops[i] + Math.max(0, heights[i] - vh);
    if (y < holdEnd) return i;
    if (y < tops[i + 1]) return i + (y - holdEnd) / Math.max(1, tops[i + 1] - holdEnd);
  }
  return panels.length - 1;
}

measure();
window.addEventListener('resize', measure);
new ResizeObserver(measure).observe(document.querySelector('main')!);
window.addEventListener('scroll', () => scene?.setProgress(scrollProgress()), { passive: true });

// ── Aktif bölüm: belirme animasyonu, noktalar, sayaç ────────────────

function setActive(index: number) {
  dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
  counter.textContent = String(index + 1).padStart(2, '0');
  reachSection(index);
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      setActive(panels.indexOf(entry.target as HTMLElement));
    }
  },
  { rootMargin: '-45% 0px -45% 0px' },
);
panels.forEach((p) => observer.observe(p));
panels[0].classList.add('is-visible');
setActive(0);

// Uzun bölümlerin içeriği ekrana girer girmez belirsin
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-visible')),
  { threshold: 0.15 },
);
panels.forEach((p) => revealObserver.observe(p));

// ── Öneri formu ─────────────────────────────────────────────────────

const form = document.getElementById('suggest-form') as HTMLFormElement;
const chipsEl = document.getElementById('topic-chips')!;
const message = document.getElementById('s-message') as HTMLTextAreaElement;
const count = document.getElementById('s-count')!;
const statusEl = document.getElementById('s-status')!;
const thanks = document.getElementById('suggest-thanks')!;
const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

for (const topic of TOPICS) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.dataset.topic = topic;
  chip.textContent = topicLabel(topic);
  chip.setAttribute('aria-pressed', 'false');
  chip.addEventListener('click', () => {
    chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    setStatus('');
  });
  chipsEl.append(chip);
}

message.addEventListener('input', () => {
  count.textContent = String(message.value.length);
  setStatus('');
});

onLangChange(() => {
  chipsEl.querySelectorAll<HTMLElement>('.chip').forEach((c) => (c.textContent = topicLabel(c.dataset.topic!)));
  setStatus('');
  renderJoin();
});

function setStatus(text: string, state: 'error' | 'info' = 'info') {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

form.addEventListener('focusin', () => root.classList.add('no-snap'));
form.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!form.contains(document.activeElement)) root.classList.remove('no-snap');
  }, 150);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const topics = [...chipsEl.querySelectorAll<HTMLElement>('[aria-pressed="true"]')].map((c) => c.dataset.topic!);
  const text = message.value.trim();

  if (topics.length === 0 && text.length < 3) {
    setStatus(t('form.needInput'), 'error');
    return;
  }
  if (text.length > LIMITS.message) {
    setStatus(t('form.tooLong', { n: LIMITS.message }), 'error');
    return;
  }

  submitBtn.disabled = true;
  setStatus(t('form.sending'));
  try {
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topics,
        message: text,
        name: String(data.get('name') ?? ''),
        website: String(data.get('website') ?? ''),
        device: deviceId(),
      }),
    });
    if (!res.ok) throw new Error(t(res.status === 429 ? 'form.rateLimited' : 'form.failed'));
    form.reset();
    chipsEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    count.textContent = '0';
    setStatus('');
    form.hidden = true;
    thanks.hidden = false;
    root.classList.remove('no-snap');
    (document.activeElement as HTMLElement | null)?.blur();
    scene?.pulse();
    track('suggest');
  } catch (err) {
    setStatus(err instanceof Error && err.message ? err.message : t('form.failed'), 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('suggest-again')!.addEventListener('click', () => {
  thanks.hidden = true;
  form.hidden = false;
  message.focus();
});

// ── Üyelik bağlantısı (admin panelinden ayarlanır) ──────────────────

const joinLink = document.getElementById('join-link') as HTMLAnchorElement;
const joinNote = document.getElementById('join-note')!;
let membershipUrl = '';

function renderJoin() {
  if (membershipUrl) {
    joinLink.href = membershipUrl;
    joinLink.target = '_blank';
    joinLink.rel = 'noopener';
    joinLink.removeAttribute('aria-disabled');
  }
  joinLink.textContent = t(membershipUrl ? 'join.open' : 'join.soon');
  joinNote.textContent = t(membershipUrl ? 'join.openNote' : 'join.soonNote');
}

renderJoin();
joinLink.addEventListener('click', () => membershipUrl && track('join'));
document.querySelectorAll<HTMLAnchorElement>('[data-track]').forEach((a) => {
  a.addEventListener('click', () => track(a.dataset.track as 'linkedin' | 'instagram'));
});

fetch('/api/config')
  .then((r) => (r.ok ? r.json() : null))
  .then((config: { membershipUrl?: string } | null) => {
    membershipUrl = config?.membershipUrl ?? '';
    renderJoin();
  })
  .catch(() => {});
