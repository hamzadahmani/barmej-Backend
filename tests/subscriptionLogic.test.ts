import {describe, expect, it} from 'vitest';
import {defaultEnd, monthsCovered, overlaps, parseDay, periodState, placeSubscriptionState, suggestedAmount, summarizeSubscriptions, tunisToday} from '../src/subscriptionLogic';

const d = parseDay;
const period = (id: number, placeId: number, plan: string, start: string, end: string, amount: number, cancelled = false) =>
  ({id, placeId, plan, startsAt: d(start), endsAt: d(end), amount, cancelledAt: cancelled ? new Date() : null, createdAt: d(start)});

describe('abonnements : périodes et montants', () => {
  it('compte les mois couverts et propose la fin de période', () => {
    expect(monthsCovered(d('2026-10-01'), d('2026-10-31'))).toBe(1);
    expect(monthsCovered(d('2026-10-15'), d('2026-11-14'))).toBe(1);
    expect(monthsCovered(d('2026-01-01'), d('2026-12-31'))).toBe(12);
    expect(defaultEnd(d('2026-01-31'))).toEqual(d('2026-02-27'));
    expect(defaultEnd(d('2026-10-12'), 3)).toEqual(d('2027-01-11'));
  });

  it('suggère le montant à partir des prix', () => {
    expect(suggestedAmount({monthlyPrice: 49}, d('2026-10-01'), d('2026-12-31'))).toBe(147);
    expect(suggestedAmount({monthlyPrice: 49, yearlyPrice: 490}, d('2026-01-01'), d('2026-12-31'))).toBe(490);
    expect(suggestedAmount(undefined, d('2026-10-01'), d('2026-10-31'))).toBe(0);
  });

  it('détermine l’état d’une période et les chevauchements (dates incluses)', () => {
    const today = d('2026-10-12');
    expect(periodState(period(1, 1, 'PRO', '2026-10-01', '2026-10-12', 0), today)).toBe('active');
    expect(periodState(period(1, 1, 'PRO', '2026-10-13', '2026-11-12', 0), today)).toBe('scheduled');
    expect(periodState(period(1, 1, 'PRO', '2026-09-01', '2026-10-11', 0), today)).toBe('ended');
    expect(overlaps({startsAt: d('2026-10-01'), endsAt: d('2026-10-31')}, {startsAt: d('2026-10-31'), endsAt: d('2026-11-30')})).toBe(true);
    expect(overlaps({startsAt: d('2026-10-01'), endsAt: d('2026-10-31')}, {startsAt: d('2026-11-01'), endsAt: d('2026-11-30')})).toBe(false);
    expect(tunisToday(new Date('2026-10-11T23:30:00Z'))).toEqual(d('2026-10-12'));
  });

  it('donne l’état d’un établissement', () => {
    const today = d('2026-10-12');
    expect(placeSubscriptionState([period(1, 1, 'PRO', '2026-10-01', '2026-10-20', 49)], today)).toMatchObject({state: 'expiring', daysLeft: 8, totalPaid: 49});
    expect(placeSubscriptionState([period(1, 1, 'PRO', '2026-10-01', '2026-10-20', 49), period(2, 1, 'PRO', '2026-10-21', '2026-11-20', 49)], today).state).toBe('active');
    expect(placeSubscriptionState([period(1, 1, 'PRO', '2026-08-01', '2026-08-31', 49)], today).state).toBe('expired');
    expect(placeSubscriptionState([period(1, 1, 'PRO', '2026-10-01', '2026-10-31', 49, true)], today).state).toBe('none');
  });
});

describe('abonnements : statistiques', () => {
  it('calcule le revenu mensuel, les échéances et le renouvellement', () => {
    const today = d('2026-10-12');
    const stats = summarizeSubscriptions({
      today,
      placeCount: 10,
      periods: [
        period(1, 1, 'PRO', '2026-09-01', '2026-09-30', 99),
        period(2, 1, 'PRO', '2026-10-01', '2026-10-31', 99),
        period(3, 2, 'ESSENTIAL', '2026-01-01', '2026-12-31', 480),
        period(4, 3, 'PREMIUM', '2026-08-15', '2026-09-14', 199),
        period(5, 4, 'PRO', '2026-10-01', '2026-10-20', 99, true),
      ],
    });
    expect(stats.payingPlaces).toBe(2);
    expect(stats.freePlaces).toBe(8);
    expect(stats.mrr).toBe(139); // 99 + 480 / 12
    expect(stats.byPlan.find(p => p.plan === 'PRO')).toEqual({plan: 'PRO', active: 1, mrr: 99});
    expect(stats.revenueThisMonth).toBe(99);
    expect(stats.monthly.at(-1)).toEqual({month: '2026-10', revenue: 99, newSubscriptions: 0, renewals: 1});
    expect(stats.expiringSoon.map(e => e.placeId)).toEqual([]);
    expect(stats.recentlyExpired.map(e => e.placeId)).toEqual([3]);
    expect(stats.renewalRate).toBe(50);
  });
});
