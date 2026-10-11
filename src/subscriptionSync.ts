import {SubscriptionPlan} from '@prisma/client';
import {prisma} from './db';
import {tunisToday} from './subscriptionLogic';
import {subscriptionCatalog} from './subscriptions';

/**
 * Abonnement en vigueur d'un établissement : la formule suit la période payée
 * qui couvre aujourd'hui ; à la fin de la dernière période, retour à Découverte.
 * Les abonnements posés à la main sans date de fin restent tels quels.
 */
export async function resolveSubscription(placeId: number, now = new Date()) {
  const subscription = await prisma.establishmentSubscription.upsert({where: {placeId}, update: {}, create: {placeId, plan: SubscriptionPlan.DISCOVERY}});
  const today = tunisToday(now);
  const period = await prisma.subscriptionPeriod.findFirst({
    where: {placeId, cancelledAt: null, startsAt: {lte: today}, endsAt: {gte: today}},
    orderBy: {createdAt: 'desc'},
  });
  if (period) {
    const same = subscription.plan === period.plan
      && subscription.startsAt?.getTime() === period.startsAt.getTime()
      && subscription.endsAt?.getTime() === period.endsAt.getTime();
    if (same) return subscription;
    return prisma.establishmentSubscription.update({
      where: {placeId},
      data: {
        plan: period.plan, startsAt: period.startsAt, endsAt: period.endsAt, activatedAt: subscription.activatedAt ?? now,
        ...(subscription.requestedPlan === period.plan ? {requestedPlan: null, requestedAt: null} : {}),
      },
    });
  }
  if (subscription.plan !== SubscriptionPlan.DISCOVERY && subscription.endsAt && subscription.endsAt < today) {
    return prisma.establishmentSubscription.update({where: {placeId}, data: {plan: SubscriptionPlan.DISCOVERY, startsAt: null, endsAt: null}});
  }
  return subscription;
}

/** Prix des formules (en dinars) ; null si pas encore fixé. */
export async function planPrices() {
  const rows = await prisma.subscriptionPlanPrice.findMany();
  return new Map(rows.map(row => [row.plan, {monthlyPrice: row.monthlyPrice, yearlyPrice: row.yearlyPrice}]));
}

/** Catalogue des formules avec les prix définis dans le backoffice. */
export async function catalogWithPrices() {
  const prices = await planPrices();
  return subscriptionCatalog.map(item => ({
    ...item,
    monthlyPriceTnd: prices.get(item.plan)?.monthlyPrice ?? item.monthlyPriceTnd,
    yearlyPriceTnd: prices.get(item.plan)?.yearlyPrice ?? null,
  }));
}
