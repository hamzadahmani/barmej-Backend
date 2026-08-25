import {NextFunction, Request, Response} from 'express';
import jwt from 'jsonwebtoken';
import {config} from './config';

export type AuthRequest = Request & {userId: number};

export const signToken = (userId: number) =>
  jwt.sign({sub: userId}, config.JWT_SECRET, {expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']});

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
