import {describe, expect, it} from 'vitest';
import {SubscriptionPlan, SubscriptionStatus} from '@prisma/client';
import {minimumPlanForFeature, subscriptionAllows, subscriptionFeatures} from '../src/subscriptions';

describe('subscription plans', () => {
  it('inherits the capabilities of lower plans', () => {
    expect(subscriptionFeatures(SubscriptionPlan.PREMIUM)).toEqual(expect.arrayContaining(subscriptionFeatures(SubscriptionPlan.PRO)));
    expect(subscriptionFeatures(SubscriptionPlan.PRO)).toEqual(expect.arrayContaining(subscriptionFeatures(SubscriptionPlan.ESSENTIAL)));
  });

  it('does not grant paid capabilities to Discovery', () => {
    expect(subscriptionAllows(SubscriptionPlan.DISCOVERY, SubscriptionStatus.ACTIVE, 'VIDEO')).toBe(false);
    expect(subscriptionAllows(SubscriptionPlan.DISCOVERY, SubscriptionStatus.ACTIVE, 'RESERVATIONS')).toBe(true);
  });

  it('disables capabilities when an activated plan is suspended', () => {
    expect(subscriptionAllows(SubscriptionPlan.PREMIUM, SubscriptionStatus.SUSPENDED, 'PREMIUM_SUPPORT')).toBe(false);
  });

  it('returns the first plan that unlocks a capability', () => {
    expect(minimumPlanForFeature('EVENTS')).toBe(SubscriptionPlan.ESSENTIAL);
    expect(minimumPlanForFeature('VIDEO')).toBe(SubscriptionPlan.PRO);
    expect(minimumPlanForFeature('FEED_PRIORITY')).toBe(SubscriptionPlan.PREMIUM);
  });
});
