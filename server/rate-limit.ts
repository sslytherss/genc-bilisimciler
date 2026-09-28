import type { NextFunction, Request, Response } from 'express';

type Options = {
  windowMs: number;
  max: number;
  message: string;
  /** Neye göre sayılacağı. Varsayılan: IP. `null` dönerse bu sınırlayıcı atlanır. */
  key?: (req: Request) => string | null;
};

/**
 * Bellek içi, sabit pencereli sınırlayıcı. Her istek O(1): anahtar başına yalnızca bir sayaç
 * ve pencere başlangıcı tutulur, yani saldırı altında bile istek başı maliyet sabit kalır.
 * Tek sunucu için yeterli; birden fazla sunucuya geçilirse Redis gibi ortak bir depo gerekir.
 */
export function rateLimit({ windowMs, max, message, key = (req) => req.ip ?? 'unknown' }: Options) {
  const hits = new Map<string, { start: number; count: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (now - entry.start >= windowMs) hits.delete(k);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const k = key(req);
    if (k === null) return next();
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(k, entry);
    }
    if (entry.count >= max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }
    entry.count++;
    next();
  };
}
