// Règles des séjours en maison d'hôtes : réservation à la nuit (arrivée → départ).
export type StayRequest = {checkIn: string; checkOut: string; guests: number; rooms: number};
export type BookedRange = {checkIn: Date; checkOut: Date; rooms: number};

const DAY = 86_400_000;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Date « YYYY-MM-DD » en minuit UTC, pour comparer des nuits sans fuseau horaire. */
export function parseDay(value: string) {
  if (!isoDate.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

export function nightsBetween(checkIn: Date, checkOut: Date) {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / DAY);
}

/** Vérifie une demande et renvoie un message clair en cas de problème. */
export function validateStay(request: StayRequest, today = new Date()) {
  const checkIn = parseDay(request.checkIn);
  const checkOut = parseDay(request.checkOut);
  if (!checkIn || !checkOut) return {error: 'Indiquez des dates d’arrivée et de départ valides.'} as const;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (checkIn.getTime() < todayUtc) return {error: 'La date d’arrivée est déjà passée.'} as const;
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return {error: 'Le départ doit être au moins le lendemain de l’arrivée.'} as const;
  if (nights > 30) return {error: 'Un séjour est limité à 30 nuits.'} as const;
  if (checkIn.getTime() - todayUtc > 365 * DAY) return {error: 'Réservez au plus un an à l’avance.'} as const;
  if (!Number.isInteger(request.guests) || request.guests < 1 || request.guests > 30) return {error: 'Indiquez entre 1 et 30 voyageurs.'} as const;
  if (!Number.isInteger(request.rooms) || request.rooms < 1 || request.rooms > 10) return {error: 'Indiquez entre 1 et 10 chambres.'} as const;
  return {checkIn, checkOut, nights} as const;
}

export const overlaps = (a: {checkIn: Date; checkOut: Date}, b: {checkIn: Date; checkOut: Date}) =>
  a.checkIn < b.checkOut && a.checkOut > b.checkIn;

/**
 * Chambres encore libres sur toute la période. null quand la maison n'a pas déclaré
 * son nombre de chambres : la demande est alors transmise à l'hôte, qui confirme.
 */
export function roomsLeft(roomCount: number | null | undefined, booked: BookedRange[], period: {checkIn: Date; checkOut: Date}) {
  if (roomCount == null) return null;
  const relevant = booked.filter(item => overlaps(item, period));
  let worst = 0;
  for (let day = period.checkIn.getTime(); day < period.checkOut.getTime(); day += DAY) {
    const night = {checkIn: new Date(day), checkOut: new Date(day + DAY)};
    worst = Math.max(worst, relevant.filter(item => overlaps(item, night)).reduce((sum, item) => sum + item.rooms, 0));
  }
  return Math.max(0, roomCount - worst);
}

/** Estimation « à partir de » : prix d'une nuit × nuits × chambres. */
export function stayEstimate(nightlyPrice: number | null | undefined, nights: number, rooms: number) {
  return nightlyPrice == null ? null : nightlyPrice * nights * rooms;
}

/** Transitions autorisées côté hôte (Barmej Pro). */
const STAY_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'DECLINED'],
  PROPOSED: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'DECLINED'],
};
export const canMoveStay = (from: string, to: string) => STAY_TRANSITIONS[from]?.includes(to) ?? false;
