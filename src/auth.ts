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
    const current = await tx.refreshToken.findUnique({where: {tokenHash}});
    if (!current || current.revokedAt || current.expiresAt <= new Date()) return null;
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({message: 'Authentification requise'});
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) throw new Error('Invalid token');
    (req as AuthRequest).userId = userId;
    next();
  } catch {
    return res.status(401).json({message: 'Jeton invalide ou expiré'});
  }
}
