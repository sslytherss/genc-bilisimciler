// Öneri formundaki hızlı seçim etiketleri. Sunucu da bu listeyle doğrulama yapar.
export const TOPICS = [
  'Yapay Zekâ',
  'Siber Güvenlik / CTF',
  'Hackathon',
  'Yazılım Atölyesi',
  'Robotik & IoT',
  'Sektörden Konuşmacı',
  'Kariyer & Staj',
  'Teknik Gezi',
] as const;

export type Topic = (typeof TOPICS)[number];

export const LIMITS = {
  name: 60,
  message: 1000,
  maxTopics: TOPICS.length,
} as const;
