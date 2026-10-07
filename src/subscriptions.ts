import {SubscriptionPlan, SubscriptionStatus} from '@prisma/client';

export type SubscriptionFeature =
  | 'PROFILE' | 'RESERVATIONS' | 'PHOTOS' | 'BASIC_STATS'
  | 'QR_SCANNER' | 'EVENTS' | 'REVIEWS' | 'WAITLIST'
  | 'VIDEO' | 'LOYALTY' | 'ADVANCED_STATS' | 'CUSTOMER_INSIGHTS'
  | 'SPONSORED_CAMPAIGNS' | 'FEED_PRIORITY' | 'PREMIUM_SUPPORT';

const base: SubscriptionFeature[] = ['PROFILE', 'RESERVATIONS', 'PHOTOS', 'BASIC_STATS'];
const essential: SubscriptionFeature[] = [...base, 'QR_SCANNER', 'EVENTS', 'REVIEWS', 'WAITLIST'];
const pro: SubscriptionFeature[] = [...essential, 'VIDEO', 'LOYALTY', 'ADVANCED_STATS', 'CUSTOMER_INSIGHTS'];

export const subscriptionCatalog = [
  {plan: SubscriptionPlan.DISCOVERY, label: 'Découverte', tagline: 'Pour lancer votre présence sur Barmej', monthlyPriceTnd: 0, features: base},
  {plan: SubscriptionPlan.ESSENTIAL, label: 'Essentiel', tagline: 'Pour gérer les réservations au quotidien', monthlyPriceTnd: null, features: essential},
  {plan: SubscriptionPlan.PRO, label: 'Pro', tagline: 'Pour fidéliser et piloter votre activité', monthlyPriceTnd: null, features: pro},
  {plan: SubscriptionPlan.PREMIUM, label: 'Premium', tagline: 'Pour accélérer votre visibilité et votre croissance', monthlyPriceTnd: null, features: [...pro, 'SPONSORED_CAMPAIGNS', 'FEED_PRIORITY', 'PREMIUM_SUPPORT'] as SubscriptionFeature[]},
];

export const subscriptionFeatures = (plan: SubscriptionPlan) =>
  subscriptionCatalog.find(item => item.plan === plan)?.features ?? base;

export const subscriptionAllows = (plan: SubscriptionPlan, status: SubscriptionStatus, feature: SubscriptionFeature) =>
  status === SubscriptionStatus.ACTIVE && subscriptionFeatures(plan).includes(feature);

export const minimumPlanForFeature = (feature: SubscriptionFeature) =>
  subscriptionCatalog.find(item => item.features.includes(feature))?.plan ?? SubscriptionPlan.PREMIUM;

export const subscriptionDto = (subscription: any) => ({
  idSubscription: subscription.id,
  idPlace: subscription.placeId,
  plan: subscription.plan,
  status: subscription.status,
  requestedPlan: subscription.requestedPlan,
  requestedAt: subscription.requestedAt,
  startsAt: subscription.startsAt,
  endsAt: subscription.endsAt,
  activatedAt: subscription.activatedAt,
  features: subscriptionFeatures(subscription.plan),
});
