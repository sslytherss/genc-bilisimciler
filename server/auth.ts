import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE = 'gbt_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createAuth(adminPassword: string | undefined, sessionSecret: string | undefined) {
  const secret = sessionSecret || randomBytes(32).toString('hex');
  const passwordDigest = adminPassword ? sha256(adminPassword) : null;
  // Çıkış yapılan oturumlar süreleri dolana kadar burada tutulur; çalınmış bir çerez çıkıştan sonra işe yaramaz
  const revoked = new Map<string, number>();

  setInterval(() => {
    const now = Date.now();
    for (const [nonce, expiry] of revoked) if (expiry < now) revoked.delete(nonce);
  }, 60 * 60 * 1000).unref();

  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

  function issueToken(): string {
    const payload = `${Date.now() + SESSION_TTL_MS}.${randomBytes(12).toString('base64url')}`;
    return `${payload}.${sign(payload)}`;
  }

  /** Geçerliyse { expiry, nonce } döner */
  function parseToken(token: string | undefined) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [expiry, nonce, signature] = parts;
    if (!safeEqual(Buffer.from(signature), Buffer.from(sign(`${expiry}.${nonce}`)))) return null;
    if (!(Number(expiry) > Date.now()) || revoked.has(nonce)) return null;
    return { expiry: Number(expiry), nonce };
  }

  return {
    enabled: passwordDigest !== null,

    checkPassword(candidate: unknown): boolean {
      if (!passwordDigest || typeof candidate !== 'string') return false;
      return safeEqual(sha256(candidate), passwordDigest);
    },

    startSession(req: Request, res: Response) {
      res.cookie(SESSION_COOKIE, issueToken(), {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure,
        path: '/api/admin',
        maxAge: SESSION_TTL_MS,
      });
    },

    endSession(req: Request, res: Response) {
      const session = parseToken(readCookie(req, SESSION_COOKIE));
      if (session) revoked.set(session.nonce, session.expiry);
      res.clearCookie(SESSION_COOKIE, { path: '/api/admin' });
    },

    isAuthenticated(req: Request): boolean {
      return parseToken(readCookie(req, SESSION_COOKIE)) !== null;
    },

    requireAdmin(req: Request, res: Response, next: NextFunction) {
      if (parseToken(readCookie(req, SESSION_COOKIE))) return next();
      res.status(401).json({ error: 'Oturum gerekli.' });
    },
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined; // bozuk kodlanmış çerez: oturum yok say
      }
    }
  }
  return undefined;
}
