export type ScoreSignals = {
  interest: number;
  proximity: number;
  engagement: number;
  freshness: number;
  quality: number;
  popularity: number;
  availability: number;
  novelty: number;
  seenPenalty: number;
};

const normalWeights = {interest: .24, proximity: .18, engagement: .15, freshness: .12, quality: .10, popularity: .08, availability: .07, novelty: .06};
const coldStartWeights = {interest: .06, proximity: .25, engagement: .18, freshness: .16, quality: .16, popularity: .12, availability: .04, novelty: .03};

export function scoreCandidate(signals: ScoreSignals, coldStart: boolean) {
  const weights = coldStart ? coldStartWeights : normalWeights;
  return Object.entries(weights).reduce((total, [key, weight]) => total + signals[key as keyof typeof weights] * weight, 0) - signals.seenPenalty;
}

export function campaignEligible(input: {
  userImpressions: number;
  maxUserImpressions: number;
  dailyImpressions: number;
  totalImpressions: number;
  bidCpmCents: number;
  dailyBudgetCents: number;
  totalBudgetCents: number;
  distanceKm?: number | null;
  radiusKm?: number | null;
}) {
  if (input.userImpressions >= input.maxUserImpressions) return false;
  if ((input.dailyImpressions * input.bidCpmCents) / 1000 >= input.dailyBudgetCents) return false;
  if ((input.totalImpressions * input.bidCpmCents) / 1000 >= input.totalBudgetCents) return false;
  return input.radiusKm == null || input.distanceKm == null || input.distanceKm <= input.radiusKm;
}

export function isOpenAt(openTime: string | null, closeTime: string | null, isClosed: boolean, time: string) {
  if (isClosed) return false;
  if (!openTime || !closeTime) return true;
  return closeTime > openTime ? time >= openTime && time <= closeTime : time >= openTime || time <= closeTime;
}
