import {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {createHash, randomBytes} from 'node:crypto';
import {config} from './config';
import {prisma} from './db';

export type AuthRequest = Request & {userId: number};

export const signToken = (userId: number) =>
  jwt.sign({sub: userId}, config.JWT_SECRET, {expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']});

const refreshHash = (token: string) => createHash('sha256').update(token).digest('hex');
const refreshExpiry = () => new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000);

export async function createSessionTokens(userId: number) {
  const refreshToken = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({data: {userId, tokenHash: refreshHash(refreshToken), expiresAt: refreshExpiry()}});
  return {token: signToken(userId), refreshToken};
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = refreshHash(rawToken);
  return prisma.$transaction(async tx => {
    const current = await tx.refreshToken.findUnique({where: {tokenHash}, include: {user: {select: {suspendedAt: true}}}});
    if (!current || current.revokedAt || current.expiresAt <= new Date() || current.user.suspendedAt) return null;
    const refreshToken = randomBytes(48).toString('base64url');
    const replacementHash = refreshHash(refreshToken);
    const revoked = await tx.refreshToken.updateMany({
      where: {id: current.id, revokedAt: null},
      data: {revokedAt: new Date(), replacedByTokenHash: replacementHash},
    });
    if (revoked.count !== 1) return null;
    await tx.refreshToken.create({data: {userId: current.userId, tokenHash: replacementHash, expiresAt: refreshExpiry()}});
    return {token: signToken(current.userId), refreshToken};
  });
}

export async function revokeRefreshToken(rawToken: string) {
  await prisma.refreshToken.updateMany({where: {tokenHash: refreshHash(rawToken), revokedAt: null}, data: {revokedAt: new Date()}});
}

export const signReservationTicket = (reservationId: number, userId: number) =>
  jwt.sign({type: 'reservation-ticket', reservationId, userId}, config.JWT_SECRET, {expiresIn: '1y'});

export const verifyReservationTicket = (token: string) => {
  const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== 'reservation-ticket') throw new Error('Invalid ticket');
  const reservationId = Number(payload.reservationId);
  const userId = Number(payload.userId);
  if (!Number.isInteger(reservationId) || !Number.isInteger(userId)) throw new Error('Invalid ticket');
  return {reservationId, userId};
};

export const SUSPENDED_MESSAGE = 'Votre compte Barmej est suspendu. Contactez le support Barmej pour en savoir plus.';

/**
 * Suspension des comptes : vérifiée à chaque requête authentifiée, avec un petit
 * cache (30 s) pour ne pas interroger la base à chaque appel.
 */
const suspensionCache = new Map<number, {suspended: boolean; checkedAt: number}>();
const SUSPENSION_TTL_MS = 30_000;
export const forgetSuspension = (userId: number) => suspensionCache.delete(userId);
export async function isSuspended(userId: number) {
  const cached = suspensionCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < SUSPENSION_TTL_MS) return cached.suspended;
  try {
    const user = await prisma.user.findUnique({where: {id: userId}, select: {suspendedAt: true}});
    const suspended = Boolean(user?.suspendedAt);
    suspensionCache.set(userId, {suspended, checkedAt: Date.now()});
    return suspended;
  } catch {
    return false; // Base indisponible : la requête échouera de toute façon plus loin.
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({message: 'Authentification requise'});
  let userId: number;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    userId = Number(payload.sub);
    if (!Number.isInteger(userId)) throw new Error('Invalid token');
  } catch {
    return res.status(401).json({message: 'Jeton invalide ou expiré'});
  }
  (req as AuthRequest).userId = userId;
  isSuspended(userId)
    .then(suspended => (suspended ? res.status(403).json({message: SUSPENDED_MESSAGE, code: 'ACCOUNT_SUSPENDED'}) : next()))
    .catch(next);
}

/** Identifiant de l'utilisateur si un jeton valide est fourni, sinon undefined (routes publiques). */
export function readUserId(req: Request): number | undefined {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return undefined;
  try {
    const userId = Number((jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload).sub);
    return Number.isInteger(userId) ? userId : undefined;
  } catch {
    return undefined;
  }
}
