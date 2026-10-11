/**
 * Abonnements des établissements : calculs purs (sans base de données) pour
 * les périodes datées, les montants suggérés et les statistiques du backoffice.
 * Les dates de période sont des jours entiers, début et fin inclus.
 */
import {tunisDay} from './audienceLogic';

export const DAY_MS = 86_400_000;
const AVERAGE_MONTH_DAYS = 30.4375;
export const EXPIRING_SOON_DAYS = 14;

/** Jour (AAAA-MM-JJ) → date à minuit UTC, comparable aux colonnes DATE. */
export const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const dayString = (date: Date) => date.toISOString().slice(0, 10);
/** Aujourd'hui à Tunis. */
export const tunisToday = (now = new Date()) => parseDay(tunisDay(now));
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
export const lengthInDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
};

/** Nombre de mois couverts (1 oct → 31 oct = 1 ; 1 oct → 30 sept = 12). */
export function monthsCovered(start: Date, end: Date) {
  const endExclusive = addDays(end, 1);
  let months = 0;
  while (addMonths(start, months + 1) <= endExclusive) months += 1;
  const rest = (endExclusive.getTime() - addMonths(start, months).getTime()) / DAY_MS;
  return Math.round((months + rest / AVERAGE_MONTH_DAYS) * 100) / 100;
}

/** Fin par défaut : un mois (ou n mois) après le début, dernier jour inclus. */
export const defaultEnd = (start: Date, months = 1) => addDays(addMonths(start, months), -1);

/** Montant suggéré : prix annuel pour 12 mois s'il existe, sinon prix mensuel × mois couverts. */
export function suggestedAmount(price: {monthlyPrice: number; yearlyPrice?: number | null} | undefined, start: Date, end: Date) {
  if (!price) return 0;
  const months = monthsCovered(start, end);
  if (months === 12 && price.yearlyPrice != null) return price.yearlyPrice;
  return Math.round(price.monthlyPrice * months);
}

/** Part mensuelle d'un paiement (pour le revenu mensuel récurrent). */
export const monthlyValue = (amount: number, start: Date, end: Date) => amount / Math.max(monthsCovered(start, end), 1 / AVERAGE_MONTH_DAYS);

export type PeriodLike = {id: number; placeId: number; plan: string; startsAt: Date; endsAt: Date; amount: number; cancelledAt?: Date | null; createdAt?: Date};
export type PeriodState = 'cancelled' | 'scheduled' | 'active' | 'ended';

export function periodState(period: PeriodLike, today: Date): PeriodState {
  if (period.cancelledAt) return 'cancelled';
  if (period.startsAt > today) return 'scheduled';
  if (period.endsAt < today) return 'ended';
  return 'active';
}

export const overlaps = (a: {startsAt: Date; endsAt: Date}, b: {startsAt: Date; endsAt: Date}) => a.startsAt <= b.endsAt && b.startsAt <= a.endsAt;

export type PlaceState = 'active' | 'expiring' | 'scheduled' | 'expired' | 'none';

/** État de l'abonnement d'un établissement à partir de ses périodes. */
export function placeSubscriptionState(periods: PeriodLike[], today: Date) {
  const valid = periods.filter(p => !p.cancelledAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const current = [...valid].reverse().find(p => periodState(p, today) === 'active') ?? null;
  const next = valid.find(p => p.startsAt > today) ?? null;
  const last = [...valid].reverse().find(p => p.endsAt < today) ?? null;
  const daysLeft = current ? lengthInDays(today, current.endsAt) - 1 : null;
  let state: PlaceState = 'none';
  if (current) state = daysLeft != null && daysLeft <= EXPIRING_SOON_DAYS && !next ? 'expiring' : 'active';
  else if (next) state = 'scheduled';
  else if (last) state = 'expired';
  return {current, next, last, daysLeft, state, totalPaid: valid.reduce((sum, p) => sum + p.amount, 0)};
}

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

/** Statistiques globales des abonnements. */
export function summarizeSubscriptions(input: {periods: PeriodLike[]; placeCount: number; today: Date; months?: number}) {
  const {today} = input;
  const months = input.months ?? 12;
  const valid = input.periods.filter(p => !p.cancelledAt);
  const byPlace = new Map<number, PeriodLike[]>();
  for (const period of valid) byPlace.set(period.placeId, [...(byPlace.get(period.placeId) ?? []), period]);

  const active = valid.filter(p => periodState(p, today) === 'active');
  // Une seule période active compte par établissement (la plus récente).
  const activeByPlace = new Map<number, PeriodLike>();
  for (const period of active) {
    const seen = activeByPlace.get(period.placeId);
    if (!seen || (period.createdAt ?? period.startsAt) > (seen.createdAt ?? seen.startsAt)) activeByPlace.set(period.placeId, period);
  }
  const current = [...activeByPlace.values()];
  const mrr = Math.round(current.reduce((sum, p) => sum + monthlyValue(p.amount, p.startsAt, p.endsAt), 0));

  const plans = ['ESSENTIAL', 'PRO', 'PREMIUM'];
  const byPlan = plans.map(plan => {
    const rows = current.filter(p => p.plan === plan);
    return {plan, active: rows.length, mrr: Math.round(rows.reduce((sum, p) => sum + monthlyValue(p.amount, p.startsAt, p.endsAt), 0))};
  });

  // Revenus et nouveaux abonnements par mois (montant compté au mois de début de période).
  const monthKeys = Array.from({length: months}, (_, i) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1 - i), 1));
    return monthKey(date);
  });
  const monthly = new Map(monthKeys.map(key => [key, {month: key, revenue: 0, newSubscriptions: 0, renewals: 0}]));
  for (const [, list] of byPlace) {
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    list.forEach((period, index) => {
      const row = monthly.get(monthKey(period.startsAt));
      if (!row) return;
      row.revenue += period.amount;
      if (index === 0) row.newSubscriptions += 1;
      else row.renewals += 1;
    });
  }

  const expiringSoon = current
    .filter(p => !(byPlace.get(p.placeId) ?? []).some(other => other.startsAt > p.endsAt))
    .map(p => ({placeId: p.placeId, plan: p.plan, endsAt: dayString(p.endsAt), daysLeft: lengthInDays(today, p.endsAt) - 1, amount: p.amount}))
    .filter(p => p.daysLeft <= EXPIRING_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Fin de période sur les 90 derniers jours : renouvelée si une période suit dans les 7 jours.
  const ninetyDaysAgo = addDays(today, -90);
  const endedRecently = valid.filter(p => p.endsAt < today && p.endsAt >= ninetyDaysAgo);
  const renewed = endedRecently.filter(p => (byPlace.get(p.placeId) ?? []).some(other => other.id !== p.id && other.startsAt > p.endsAt && other.startsAt <= addDays(p.endsAt, 8)));
  const recentlyExpired = endedRecently
    .filter(p => !activeByPlace.has(p.placeId) && !(byPlace.get(p.placeId) ?? []).some(other => other.startsAt > p.endsAt))
    .map(p => ({placeId: p.placeId, plan: p.plan, endedAt: dayString(p.endsAt), amount: p.amount}))
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));

  const thisMonth = monthly.get(monthKey(today));
  const revenueLast12 = [...monthly.values()].reduce((sum, m) => sum + m.revenue, 0);
  return {
    payingPlaces: activeByPlace.size,
    freePlaces: Math.max(0, input.placeCount - activeByPlace.size),
    placeCount: input.placeCount,
    payingShare: input.placeCount ? Math.round((activeByPlace.size / input.placeCount) * 1000) / 10 : 0,
    mrr,
    arr: mrr * 12,
    revenueThisMonth: thisMonth?.revenue ?? 0,
    revenueLast12,
    averageMonthlyPrice: activeByPlace.size ? Math.round(mrr / activeByPlace.size) : 0,
    renewalRate: endedRecently.length ? Math.round((renewed.length / endedRecently.length) * 1000) / 10 : null,
    byPlan,
    monthly: [...monthly.values()],
    expiringSoon,
    recentlyExpired,
  };
}
