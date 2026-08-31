import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';

const prisma = new PrismaClient();
const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8097';
const createdEmail = `recette.${Date.now()}@barmej.test`;
const results: Array<{test: string; status: 'PASS' | 'FAIL'; detail?: string}> = [];

const record = (test: string, condition: unknown, detail?: string) => {
  if (!condition) throw new Error(`${test}${detail ? `: ${detail}` : ''}`);
  results.push({test, status: 'PASS', detail});
};

const request = async <T = any>(
  path: string,
  options: RequestInit & {token?: string; expected?: number | number[]} = {},
): Promise<T> => {
  const {token, expected = 200, ...init} = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? {'content-type': 'application/json'} : {}),
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...(init.headers ?? {}),
    },
  });
  const accepted = Array.isArray(expected) ? expected : [expected];
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!accepted.includes(response.status)) {
    throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${response.status} ${text}`);
  }
  return body as T;
};

const login = async (userMail: string, userPwd: string) =>
  request<any>('/authenticate', {
    method: 'POST',
    body: JSON.stringify({userMail, userPwd}),
  });

const isoDay = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

async function main() {
  let temporaryUserId: number | null = null;
  let reservationId: number | null = null;
  try {
    const health = await request<any>('/health');
    record('API et PostgreSQL disponibles', health.status === 'ok');

    const manager = await login(process.env.SMOKE_MANAGER_EMAIL ?? 'pro@barmej.app', process.env.SMOKE_MANAGER_PASSWORD ?? 'Pro12345!');
    const scanner = await login(process.env.SMOKE_SCANNER_EMAIL ?? 'scanner.patio@barmej.app', process.env.SMOKE_SCANNER_PASSWORD ?? 'Scanner123!');
    const pro = await request<any>('/pro/me', {token: manager.token});
    const place = pro.places?.find((item: any) => item.placeName === 'Le Patio') ?? pro.places?.[0];
    record('Authentification gérant', manager.userRole?.toUpperCase() === 'ESTABLISHMENT' && Boolean(place));
    record('Authentification portier', scanner.userRole?.toUpperCase() === 'SCANNER');

    const customer = await request<any>('/signup', {
      method: 'POST',
      expected: 201,
      body: JSON.stringify({
        userMail: createdEmail,
        userPwd: 'Recette123!',
        firstName: 'Recette',
        lastName: 'Automatique',
        userMobile: '20000000',
      }),
    });
    temporaryUserId = customer.idUser;
    record('Création et authentification client', Boolean(customer.token && temporaryUserId));

    await request('/pro/me', {token: customer.token, expected: 403});
    record('Client refusé dans Barmej Pro', true);
    await request(`/pro/dashboard?placeId=${place.idPlace}`, {token: scanner.token, expected: 403});
    record('Portier limité au scan', true);

    let selected: {date: string; slots: any[]} | null = null;
    for (let offset = 7; offset <= 21 && !selected; offset += 1) {
      const date = isoDay(offset);
      const availability = await request<any>(`/places/${place.idPlace}/availability?date=${date}&guests=2`, {
        token: customer.token,
      });
      const slots = availability.slots.filter((slot: any) => slot.available);
      if (slots.length >= 2) selected = {date, slots};
    }
    record('Disponibilités réelles', Boolean(selected), 'au moins deux créneaux disponibles');

    const createReservation = (time: string, message: string) => request<any>('/addReservation', {
      method: 'POST',
      token: customer.token,
      expected: 201,
      body: JSON.stringify({
        idPlace: place.idPlace,
        reservationDate: selected!.date,
        reservationTime: time,
        numberOfPersons: 2,
        message,
        seatingPreference: 'NO_PREFERENCE',
        allergies: [],
        occasion: 'Recette automatique',
      }),
    });

    const cancelled = await createReservation(selected!.slots[0].time, 'Réservation destinée au test d’annulation');
    const cancelledResult = await request<any>(`/reservations/${cancelled.idReservation}/cancel`, {
      method: 'PATCH',
      token: customer.token,
      body: JSON.stringify({reason: 'Nettoyage de la recette automatique'}),
    });
    record('Annulation sans suppression', cancelledResult.status === 'CANCELLED');

    let reservation = await createReservation(selected!.slots[0].time, 'Réservation destinée au cycle complet');
    reservationId = reservation.idReservation;
    reservation = await request<any>('/updateReservation', {
      method: 'PUT',
      token: customer.token,
      body: JSON.stringify({
        idReservation: reservationId,
        idPlace: place.idPlace,
        reservationDate: selected!.date,
        reservationTime: selected!.slots[1].time,
        numberOfPersons: 3,
        message: 'Réservation modifiée par la recette automatique',
        seatingPreference: 'TERRACE',
        allergies: ['Test'],
        occasion: 'Recette automatique',
      }),
    });
    record('Modification avant confirmation', reservation.status === 'PENDING' && reservation.numberOfPersons === 3);

    const confirmed = await request<any>(`/pro/reservations/${reservationId}/status`, {
      method: 'PATCH',
      token: manager.token,
      body: JSON.stringify({status: 'CONFIRMED'}),
    });
    record('Confirmation par le gérant', confirmed.status === 'CONFIRMED' && Boolean(confirmed.ticketToken));

    const completed = await request<any>('/pro/tickets/scan', {
      method: 'POST',
      token: scanner.token,
      body: JSON.stringify({value: confirmed.ticketToken}),
    });
    record('QR scanné par le portier', completed.status === 'COMPLETED' && completed.alreadyScanned === false);
    const scannedAgain = await request<any>('/pro/tickets/scan', {
      method: 'POST',
      token: scanner.token,
      body: JSON.stringify({value: confirmed.ticketToken}),
    });
    record('QR idempotent', scannedAgain.alreadyScanned === true);

    const review = await request<any>('/reviews', {
      method: 'POST',
      token: customer.token,
      expected: 201,
      body: JSON.stringify({reservationId, cuisineRating: 5, serviceRating: 4, ambianceRating: 5, priceRating: 4, comment: 'Avis créé par la recette automatique.', photos: []}),
    });
    record('Avis vérifié après visite', Boolean(review.id));

    const loyalty = await request<any[]>('/loyalty', {token: customer.token});
    const account = loyalty.find(item => item.placeId === place.idPlace);
    record('Points fidélité attribués', account?.balance >= 1);
    await prisma.loyaltyAccount.update({
      where: {userId_placeId: {userId: temporaryUserId!, placeId: place.idPlace}},
      data: {balance: {increment: 100}},
    });
    const detail = await request<any>(`/loyalty/${place.idPlace}`, {token: customer.token});
    const reward = detail.rewards.find((item: any) => item.canClaim);
    record('Catalogue de récompenses', Boolean(reward));
    const redemption = await request<any>(`/loyalty/rewards/${reward.id}/claim`, {method: 'POST', token: customer.token, expected: 201});
    const redeemed = await request<any>('/pro/loyalty/redemptions/scan', {
      method: 'POST', token: scanner.token, body: JSON.stringify({value: redemption.token}),
    });
    record('Récompense validée par QR', redeemed.kind === 'LOYALTY_REWARD' && typeof redeemed.balance === 'number');

    const feed = await request<any>('/v1/feed?limit=5', {token: customer.token});
    const items = feed.items ?? feed.data ?? feed;
    record('Feed personnalisé authentifié', Array.isArray(items) && items.length > 0);
    const first = items[0];
    await request('/v1/feed/events/batch', {
      method: 'POST',
      token: customer.token,
      expected: 202,
      body: JSON.stringify({events: [{eventId: randomUUID(), sessionId: randomUUID(), videoId: first.idMedia, placeId: first.place.idPlace, type: 'FEED_IMPRESSION', occurredAt: new Date().toISOString()}]}),
    });
    record('Tracking du feed', true);

    const [dashboard, statistics, proReservations, reviews, audit, notifications] = await Promise.all([
      request<any>(`/pro/dashboard?placeId=${place.idPlace}`, {token: manager.token}),
      request<any>(`/pro/statistics?placeId=${place.idPlace}&days=30`, {token: manager.token}),
      request<any[]>(`/pro/reservations?placeId=${place.idPlace}`, {token: manager.token}),
      request<any[]>(`/pro/reviews?placeId=${place.idPlace}`, {token: manager.token}),
      request<any[]>(`/pro/audit-logs?placeId=${place.idPlace}&limit=20`, {token: manager.token}),
      request<any[]>('/notifications', {token: customer.token}),
    ]);
    record('Dashboard Barmej Pro', Boolean(dashboard));
    record('Statistiques Barmej Pro', Boolean(statistics.totals && statistics.feed));
    record('Réservation visible par le gérant', proReservations.some(item => item.idReservation === reservationId));
    record('Avis visible par le gérant', reviews.some(item => item.id === review.id));
    record('Historique des actions', audit.some(item => item.entityId === reservationId));
    record('Notifications client', notifications.length >= 3);
  } finally {
    if (temporaryUserId) {
      if (reservationId) await prisma.auditLog.deleteMany({where: {entityId: reservationId}});
      await prisma.user.deleteMany({where: {id: temporaryUserId}});
    }
    await prisma.$disconnect();
  }

  console.table(results);
  console.log(`Authenticated smoke test: ${results.length} checks passed.`);
}

main().catch(error => {
  results.push({test: 'Recette interrompue', status: 'FAIL', detail: error instanceof Error ? error.message : String(error)});
  console.table(results);
  console.error(error);
  process.exitCode = 1;
});
