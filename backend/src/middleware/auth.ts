import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  oid: Types.ObjectId;
  role: 'learner' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

interface AccessClaims {
  sub: string;
  role: 'learner' | 'admin';
  typ: 'access';
}

export function signAccessToken(userId: string, role: 'learner' | 'admin') {
  return jwt.sign({ role, typ: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: 'skillsprint-api',
    audience: 'skillsprint-app',
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'skillsprint-api',
      audience: 'skillsprint-app',
    }) as jwt.JwtPayload & AccessClaims;
    if (claims.typ !== 'access' || !claims.sub || !Types.ObjectId.isValid(claims.sub)) {
      return next(unauthorized('Invalid token'));
    }
    req.user = { id: claims.sub, oid: new Types.ObjectId(claims.sub), role: claims.role };
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      const e = unauthorized('Access token expired');
      return next(Object.assign(e, { code: 'TOKEN_EXPIRED' }));
    }
    return next(unauthorized('Invalid token'));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return next(forbidden('Administrator access required'));
  return next();
}

/** Narrowing helper for handlers that run after requireAuth. */
export function authed(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
