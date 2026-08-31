import express, {NextFunction, Request, Response} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {z, ZodError} from 'zod';
import {FeedEventType, GroupPlanStatus, LoyaltyRedemptionStatus, LoyaltyTransactionType, PlaceMediaType, Prisma, ReservationStatus, UserRole, WaitlistStatus} from '@prisma/client';
import {v2 as cloudinary} from 'cloudinary';
import {config} from './config';
import {prisma} from './db';
import {AuthRequest, requireAuth, signReservationTicket, signToken, verifyReservationTicket} from './auth';
import {placeDto, placeInfoDto, userDto} from './mappers';
import {markLateReservationsAsNoShow} from './reservationLifecycle';
import {buildFeed} from './feed';
import {cacheMode, consumeRateLimit, invalidateUserFeed, rememberSeenVideos} from './cache';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',')}));
app.use(express.json({limit: '8mb'}));
if (config.NODE_ENV !== 'test') app.use(morgan('combined'));

const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const authId = (req: Request) => (req as AuthRequest).userId;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const reservationMoment = (date: string, time: string) =>
  new Date(`${date.slice(0, 10)}T${time.slice(0, 5)}:00.000Z`);
const notify = (userId: number, title: string, message: string) =>
  prisma.notification.create({data: {userId, title, message}});
const audit = (req: Request, placeId: number, action: string, entityType: string, entityId?: number, details?: Prisma.InputJsonValue) =>
  prisma.auditLog.create({data: {actorId: authId(req), placeId, action, entityType, entityId, details}});
const awardLoyaltyPoints = async (reservation: {id: number; userId: number; placeId: number}) => {
  await prisma.$transaction(async tx => {
    const program = await tx.loyaltyProgram.findUnique({where: {placeId: reservation.placeId}});
    if (!program?.enabled || program.pointsPerVisit <= 0) return;
    if (await tx.loyaltyTransaction.findUnique({where: {reservationId: reservation.id}})) return;
    await tx.loyaltyAccount.upsert({where: {userId_placeId: {userId: reservation.userId, placeId: reservation.placeId}}, update: {balance: {increment: program.pointsPerVisit}, lifetimePoints: {increment: program.pointsPerVisit}}, create: {userId: reservation.userId, placeId: reservation.placeId, balance: program.pointsPerVisit, lifetimePoints: program.pointsPerVisit}});
    await tx.loyaltyTransaction.create({data: {userId: reservation.userId, placeId: reservation.placeId, reservationId: reservation.id, type: LoyaltyTransactionType.EARN, points: program.pointsPerVisit, note: 'Visite terminée'}});
  });
};
const eventDto = (event: any) => ({
  idEvent: event.id,
  idPlace: event.placeId,
  title: event.title,
  description: event.description,
  startDate: event.startDate?.toISOString().slice(0, 10) ?? null,
  endDate: event.endDate?.toISOString().slice(0, 10) ?? null,
  startTime: event.startTime ?? null,
  endTime: event.endTime ?? null,
  active: event.active,
});
const mediaDto = (media: any) => ({idMedia: media.id, idPlace: media.placeId, publicId: media.publicId, secureUrl: media.secureUrl, type: media.type, width: media.width, height: media.height, bytes: media.bytes, format: media.format, duration: media.duration, keywords: media.keywords ?? [], sortOrder: media.sortOrder});
const videoKeywordsSchema = z.array(z.string().trim().min(2).max(30)).length(3).transform(values => {
  const unique = new Map(values.map(value => [value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), value]));
  return [...unique.values()];
}).refine(values => values.length === 3, 'Ajoutez 3 mots-clés différents');
const cloudinaryReady = () => Boolean(config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET);
cloudinary.config({cloud_name: config.CLOUDINARY_CLOUD_NAME, api_key: config.CLOUDINARY_API_KEY, api_secret: config.CLOUDINARY_API_SECRET, secure: true});
const ensureAdmin = async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({where: {id: authId(req)}, select: {role: true}});
  if (user?.role !== UserRole.ADMIN) {
    res.status(403).json({message: 'Accès réservé à la gestion des établissements'});
    return false;
  }
  return true;
};

app.get('/health', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  return res.json({status: 'ok', feedCache: cacheMode()});
}));

const signupSchema = z.object({
  userMail: z.string().email().transform(v => v.toLowerCase().trim()),
  userPwd: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().default(''),
  userMobile: z.string().optional(),
  userGender: z.string().optional(),
  userPhoto: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

app.post('/signup', asyncRoute(async (req, res) => {
  const body = signupSchema.parse(req.body);
  const user = await prisma.user.create({data: {
    email: body.userMail,
    passwordHash: await bcrypt.hash(body.userPwd, 12),
    firstName: body.firstName,
    lastName: body.lastName,
    mobile: body.userMobile,
    gender: body.userGender,
    photo: body.userPhoto,
    birthDate: body.dateOfBirth ? dateOnly(body.dateOfBirth) : undefined,
  }});
  return res.status(201).json({token: signToken(user.id), ...userDto(user)});
}));

app.post('/authenticate', asyncRoute(async (req, res) => {
  const body = z.object({userMail: z.string().email(), userPwd: z.string()}).parse(req.body);
  const user = await prisma.user.findUnique({where: {email: body.userMail.toLowerCase().trim()}});
  if (!user?.passwordHash || !(await bcrypt.compare(body.userPwd, user.passwordHash))) {
    return res.status(401).json({message: 'Email ou mot de passe incorrect'});
  }
  return res.json({token: signToken(user.id), ...userDto(user)});
}));

app.post('/auth-external', asyncRoute(async (req, res) => {
  const externalUser = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    photo: z.string().optional(),
    id: z.string().optional(),
  });
  const body = z.object({
    user: externalUser.optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    photo: z.string().optional(),
    id: z.string().optional(),
  }).parse(req.body);
  const source = body.user ?? body;
  const email = source.email?.toLowerCase();
  if (!email) return res.status(400).json({message: 'Email Google manquant'});
  const names = (source.name ?? '').trim().split(/\s+/);
  const user = await prisma.user.upsert({
    where: {email},
    update: {externalId: source.id, photo: source.photo},
    create: {email, externalId: source.id, firstName: names.shift() || 'Utilisateur', lastName: names.join(' '), photo: source.photo},
  });
  return res.json({token: signToken(user.id), ...userDto(user)});
}));

app.get('/getAllCategories', asyncRoute(async (_req, res) => {
  const rows = await prisma.category.findMany({orderBy: {name: 'asc'}});
  return res.json(rows.map(c => ({idCategory: c.id, categoryName: c.name, image: c.image, path: c.image})));
}));

app.get('/getPlaceByCategory/:categoryId', asyncRoute(async (req, res) => {
  const categoryId = id(req.params.categoryId);
  const rows = await prisma.place.findMany({where: {OR: [{categoryId}, {categories: {some: {categoryId}}}]}, include: {categories: true}, orderBy: {name: 'asc'}});
  return res.json(rows.map(placeDto));
}));

app.get('/getPlaceInfoByIdPlace/:placeId', asyncRoute(async (req, res) => {
  const today = dateOnly(new Date().toISOString().slice(0, 10));
  const place = await prisma.place.findUnique({where: {id: id(req.params.placeId)}, include: {media: {orderBy: [{type: 'asc'}, {sortOrder: 'asc'}, {createdAt: 'asc'}]}, events: {where: {active: true, OR: [{endDate: {gte: today}}, {endDate: null, startDate: {gte: today}}, {endDate: null, startDate: null}]}, orderBy: [{startDate: 'asc'}, {createdAt: 'desc'}]}, reviews: {select: {cuisineRating: true, serviceRating: true, ambianceRating: true, priceRating: true}}}});
  if (!place) return res.status(404).json({message: 'Lieu introuvable'});
  const rating = place.reviewsEnabled && place.reviews.length ? place.reviews.reduce((sum, review) => sum + (review.cuisineRating + review.serviceRating + review.ambianceRating + review.priceRating) / 4, 0) / place.reviews.length : null;
  return res.json({place: {...placeDto(place), rating: rating ? Math.round(rating * 10) / 10 : null, reviewCount: place.reviewsEnabled ? place.reviews.length : 0}, placeinfo: placeInfoDto(place), media: place.media.map(mediaDto), events: place.events.map(eventDto)});
}));

app.get('/getFeaturedPlaces', asyncRoute(async (_req, res) => {
  const rows = await prisma.place.findMany({
    orderBy: [{updatedAt: 'desc'}, {name: 'asc'}],
    take: 12,
  });
  return res.json(rows.map(placeDto));
}));

app.get('/video-feed', asyncRoute(async (_req, res) => {
  const videos = await prisma.placeMedia.findMany({
    where: {type: PlaceMediaType.VIDEO},
    include: {place: {include: {categories: true}}},
    orderBy: [{createdAt: 'desc'}, {id: 'desc'}],
    take: 50,
  });
  return res.json(videos.map(video => ({
    ...mediaDto(video),
    place: placeDto(video.place),
  })));
}));

app.get('/v1/feed', requireAuth, asyncRoute(async (req, res) => {
  const rate = await consumeRateLimit(authId(req), 'feed-read', 120, 60);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);
  if (!rate.allowed) return res.status(429).json({message: 'Trop de demandes. Réessayez dans quelques secondes.'});
  const query = z.object({
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    mode: z.enum(['for-you', 'nearby']).default('for-you'),
    keyword: z.string().trim().min(1).max(50).optional(),
  }).parse(req.query);
  return res.json(await buildFeed({userId: authId(req), ...query}));
}));

const feedEventsSchema = z.object({events: z.array(z.object({
  eventId: z.string().uuid(),
  sessionId: z.string().min(1).max(80),
  videoId: z.number().int().positive(),
  placeId: z.number().int().positive(),
  type: z.nativeEnum(FeedEventType),
  watchMs: z.number().int().min(0).max(3_600_000).optional(),
  positionMs: z.number().int().min(0).max(3_600_000).optional(),
  metadata: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime(),
})).min(1).max(50)});

app.post('/v1/feed/events/batch', requireAuth, asyncRoute(async (req, res) => {
  const rate = await consumeRateLimit(authId(req), 'feed-events', 180, 60);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);
  if (!rate.allowed) return res.status(429).json({message: 'Trop d’événements envoyés. Réessayez dans quelques secondes.'});
  const {events} = feedEventsSchema.parse(req.body);
  const media = await prisma.placeMedia.findMany({where: {id: {in: events.map(event => event.videoId)}, type: PlaceMediaType.VIDEO}, select: {id: true, placeId: true}});
  const validMedia = new Map(media.map(video => [video.id, video.placeId]));
  const validEvents = events.filter(event => validMedia.get(event.videoId) === event.placeId);
  const campaignIds = validEvents.map(event => Number(event.metadata?.campaignId)).filter(Number.isInteger);
  const campaigns = await prisma.sponsoredCampaign.findMany({where: {id: {in: campaignIds}}, select: {id: true, videoId: true, placeId: true}});
  const validCampaigns = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  await prisma.$transaction(async tx => {
    await tx.feedEvent.createMany({data: validEvents.map(event => ({...event, userId: authId(req), occurredAt: new Date(event.occurredAt), metadata: event.metadata as Prisma.InputJsonValue | undefined})), skipDuplicates: true});
    for (const event of validEvents) {
      const isImpression = event.type === FeedEventType.FEED_IMPRESSION || event.type === FeedEventType.VIDEO_START;
      const isComplete = event.type === FeedEventType.VIDEO_COMPLETE;
      if (!isImpression && !isComplete && !event.watchMs) continue;
      await tx.userVideoState.upsert({
        where: {userId_videoId: {userId: authId(req), videoId: event.videoId}},
        create: {userId: authId(req), videoId: event.videoId, placeId: event.placeId, totalWatchMs: event.watchMs ?? 0, completedCount: isComplete ? 1 : 0},
        update: {lastSeenAt: new Date(event.occurredAt), totalWatchMs: {increment: event.watchMs ?? 0}, completedCount: {increment: isComplete ? 1 : 0}},
      });
    }
    for (const event of validEvents) {
      const campaignId = Number(event.metadata?.campaignId);
      const campaign = validCampaigns.get(campaignId);
      if (!campaign || campaign.videoId !== event.videoId || campaign.placeId !== event.placeId) continue;
      if (event.type === FeedEventType.FEED_IMPRESSION) {
        await tx.sponsoredImpression.upsert({
          where: {campaignId_userId_sessionId: {campaignId, userId: authId(req), sessionId: event.sessionId}},
          update: {},
          create: {campaignId, userId: authId(req), sessionId: event.sessionId, videoId: event.videoId},
        });
      }
      if (event.type === FeedEventType.PLACE_OPEN) {
        await tx.sponsoredImpression.updateMany({
          where: {campaignId, userId: authId(req), sessionId: event.sessionId},
          data: {clicked: true},
        });
      }
    }
  });
  const seenIds = validEvents
    .filter(event => event.type === FeedEventType.FEED_IMPRESSION || event.type === FeedEventType.VIDEO_START || event.type === FeedEventType.VIDEO_COMPLETE)
    .map(event => event.videoId);
  await Promise.all([rememberSeenVideos(authId(req), seenIds), invalidateUserFeed(authId(req))]);
  return res.status(202).json({accepted: validEvents.length, rejected: events.length - validEvents.length});
}));

app.get('/search', asyncRoute(async (req, res) => {
  const query = z.object({query: z.string().trim().max(100).default(''), categoryId: z.coerce.number().int().positive().optional(), maxPrice: z.coerce.number().positive().optional(), cuisine: z.string().trim().optional(), ambience: z.string().trim().optional(), verified: z.enum(['true', 'false']).optional(), openNow: z.enum(['true', 'false']).optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), guests: z.coerce.number().int().min(1).max(20).default(2), latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional(), sort: z.enum(['relevance', 'price', 'name', 'distance']).default('relevance')}).parse(req.query);
  const terms = query.query.toLowerCase().split(/\s+/).filter(Boolean);
  let rows = await prisma.place.findMany({where: {
    ...(query.categoryId ? {categories: {some: {categoryId: query.categoryId}}} : {}),
    ...(query.maxPrice ? {OR: [{averagePrice: null}, {averagePrice: {lte: query.maxPrice}}]} : {}),
    ...(query.cuisine ? {cuisineType: {contains: query.cuisine, mode: 'insensitive'}} : {}),
    ...(query.ambience ? {ambienceTags: {has: query.ambience}} : {}),
    ...(query.verified === 'true' ? {verified: true} : {}),
    ...(terms.length ? {AND: terms.map(term => ({OR: [{name: {contains: term, mode: 'insensitive'}}, {subtitle: {contains: term, mode: 'insensitive'}}, {address: {contains: term, mode: 'insensitive'}}, {description: {contains: term, mode: 'insensitive'}}, {cuisineType: {contains: term, mode: 'insensitive'}}, {ambienceTags: {has: term}}]}))} : {}),
  }, include: {categories: true, reviews: {select: {cuisineRating: true, serviceRating: true, ambianceRating: true, priceRating: true}}}, take: 50});
  let results = rows.map(place => {const rating = place.reviewsEnabled && place.reviews.length ? place.reviews.reduce((sum, review) => sum + (review.cuisineRating + review.serviceRating + review.ambianceRating + review.priceRating) / 4, 0) / place.reviews.length : null; const distance = query.latitude !== undefined && query.longitude !== undefined ? 6371 * Math.acos(Math.min(1, Math.cos(query.latitude * Math.PI / 180) * Math.cos(place.latitude * Math.PI / 180) * Math.cos((place.longitude - query.longitude) * Math.PI / 180) + Math.sin(query.latitude * Math.PI / 180) * Math.sin(place.latitude * Math.PI / 180))) : null; return {...placeDto(place), averagePrice: place.averagePrice, rating: rating ? Math.round(rating * 10) / 10 : null, reviewCount: place.reviewsEnabled ? place.reviews.length : 0, distance};});
  const now = new Date(); const availabilityDate = query.date ?? (query.openNow === 'true' ? now.toISOString().slice(0, 10) : undefined); const availabilityTime = query.time ?? (query.openNow === 'true' ? `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}` : undefined);
  if (availabilityDate && availabilityTime) {const checks = await Promise.all(results.map(async place => {const availability = await getAvailability(prisma, place.idPlace, availabilityDate, query.guests); return availability?.slots.some((slot: any) => slot.time === availabilityTime && slot.available) ? place : null;})); results = checks.filter(Boolean) as typeof results;}
  results.sort((a, b) => query.sort === 'price' ? (a.averagePrice ?? 99999) - (b.averagePrice ?? 99999) : query.sort === 'name' ? a.placeName.localeCompare(b.placeName) : query.sort === 'distance' ? (a.distance ?? 99999) - (b.distance ?? 99999) : (b.rating ?? 0) - (a.rating ?? 0));
  return res.json(results);
}));

app.get('/getNearMe', asyncRoute(async (req, res) => {
  const latitude = z.coerce.number().min(-90).max(90).parse(req.query.requestLatitude);
  const longitude = z.coerce.number().min(-180).max(180).parse(req.query.requestLongitude);
  const radiusKm = z.coerce.number().positive().max(100).default(20).parse(req.query.radiusKm);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id_place AS "idPlace", category_id AS "idCategory", name AS "placeName",
      subtitle AS "subTitle", image, latitude, longitude, schedule AS horaire,
      (6371 * acos(least(1, cos(radians(${latitude})) * cos(radians(latitude)) *
      cos(radians(longitude) - radians(${longitude})) + sin(radians(${latitude})) *
      sin(radians(latitude))))) AS distance
    FROM places
    WHERE (6371 * acos(least(1, cos(radians(${latitude})) * cos(radians(latitude)) *
      cos(radians(longitude) - radians(${longitude})) + sin(radians(${latitude})) *
      sin(radians(latitude))))) <= ${radiusKm}
    ORDER BY distance ASC LIMIT 50`;
  return res.json(rows);
}));

app.get('/places/:placeId/reviews', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  const place = await prisma.place.findUnique({where: {id: placeId}, select: {reviewsEnabled: true}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  if (!place.reviewsEnabled) return res.json({enabled: false, average: null, count: 0, reviews: []});
  const rows = await prisma.review.findMany({
    where: {placeId},
    include: {user: {select: {firstName: true, lastName: true}}},
    orderBy: {createdAt: 'desc'},
  });
  const average = rows.length ? rows.reduce((sum, row) => sum + (row.cuisineRating + row.serviceRating + row.ambianceRating + row.priceRating) / 4, 0) / rows.length : null;
  return res.json({enabled: true, average, count: rows.length, reviews: rows.map(row => ({...row, userName: `${row.user.firstName} ${row.user.lastName.charAt(0)}.`.trim()}))});
}));

app.get('/assistant/suggestions', asyncRoute(async (req, res) => {
  const query = z.object({q: z.string().trim().max(200).default(''), budget: z.coerce.number().positive().max(10000).optional(), occasion: z.string().trim().max(50).optional()}).parse(req.query);
  const terms = `${query.q} ${query.occasion ?? ''}`.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = await prisma.place.findMany({
    where: {
      ...(query.budget ? {OR: [{averagePrice: null}, {averagePrice: {lte: query.budget}}]} : {}),
      ...(terms.length ? {AND: terms.map(term => ({OR: [{name: {contains: term, mode: 'insensitive'}}, {subtitle: {contains: term, mode: 'insensitive'}}, {description: {contains: term, mode: 'insensitive'}}, {musicStyle: {contains: term, mode: 'insensitive'}}]}))} : {}),
    },
    take: 12,
  });
  const fallback = rows.length ? rows : await prisma.place.findMany({where: query.budget ? {OR: [{averagePrice: null}, {averagePrice: {lte: query.budget}}]} : undefined, orderBy: {updatedAt: 'desc'}, take: 12});
  return res.json(fallback.map(place => ({...placeDto(place), averagePrice: place.averagePrice, reason: query.occasion ? `Adapté à votre sortie « ${query.occasion} »` : query.budget ? `Compatible avec un budget de ${query.budget}` : 'Suggestion populaire Barmej'})));
}));

app.get('/tickets/:token', asyncRoute(async (req, res) => {
  let ticket: {reservationId: number; userId: number};
  try {
    ticket = verifyReservationTicket(z.string().min(1).parse(req.params.token));
  } catch {
    return res.status(400).json({valid: false, message: 'Billet invalide ou expiré'});
  }
  const row = await prisma.reservation.findFirst({
    where: {id: ticket.reservationId, userId: ticket.userId},
    include: {place: true, user: {select: {firstName: true, lastName: true}}},
  });
  if (!row) return res.status(404).json({valid: false, message: 'Réservation introuvable'});
  return res.json({
    valid: true,
    reservation: {
      idReservation: row.id,
      customerName: `${row.user.firstName} ${row.user.lastName}`.trim(),
      placeName: row.place.name,
      placeAddress: row.place.address,
      reservationDate: row.reservationDate.toISOString().slice(0, 10),
      reservationTime: row.reservationTime,
      numberOfPersons: row.numberOfPersons,
      status: row.status,
    },
  });
}));

app.use(requireAuth);

app.get('/getUserById', asyncRoute(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({where: {id: authId(req)}});
  return res.json(userDto(user));
}));

app.put('/updateUser', asyncRoute(async (req, res) => {
  const body = z.object({firstName: z.string().optional(), lastName: z.string().optional(), userMobile: z.string().nullable().optional(), userGender: z.string().nullable().optional(), userPhoto: z.string().nullable().optional(), dateOfBirth: z.string().optional(), dietaryPreferences: z.array(z.string().trim().min(1).max(50)).max(20).optional(), allergies: z.array(z.string().trim().min(1).max(80)).max(20).optional(), favoriteAmbiences: z.array(z.string().trim().min(1).max(50)).max(20).optional(), preferredBudget: z.coerce.number().int().min(0).max(10000).nullable().optional()}).passthrough().parse(req.body);
  const user = await prisma.user.update({where: {id: authId(req)}, data: {firstName: body.firstName, lastName: body.lastName, mobile: body.userMobile, gender: body.userGender, photo: body.userPhoto, birthDate: body.dateOfBirth ? dateOnly(body.dateOfBirth) : undefined, dietaryPreferences: body.dietaryPreferences, allergies: body.allergies, favoriteAmbiences: body.favoriteAmbiences, preferredBudget: body.preferredBudget}});
  return res.json(userDto(user));
}));

app.post('/setToken', asyncRoute(async (req, res) => {
  const {token} = z.object({token: z.string().min(1)}).parse(req.body);
  await prisma.user.update({where: {id: authId(req)}, data: {deviceToken: token}});
  return res.status(204).send();
}));

app.post('/deleteUser', asyncRoute(async (req, res) => {
  await prisma.user.delete({where: {id: authId(req)}});
  return res.status(204).send();
}));

app.get('/getAllFavorites', asyncRoute(async (req, res) => {
  const rows = await prisma.favorite.findMany({where: {userId: authId(req)}, include: {place: true}, orderBy: {createdAt: 'desc'}});
  return res.json(rows.map(row => placeDto(row.place)));
}));

app.post('/addFavorite', asyncRoute(async (req, res) => {
  const placeId = id(String(req.query.idPlace ?? req.body.idPlace));
  const row = await prisma.favorite.upsert({where: {userId_placeId: {userId: authId(req), placeId}}, update: {}, create: {userId: authId(req), placeId}});
  return res.status(201).json(row);
}));

app.delete('/deleteFavoritePlaceByIdPlaceAndUser/:placeId', asyncRoute(async (req, res) => {
  await prisma.favorite.deleteMany({where: {userId: authId(req), placeId: id(req.params.placeId)}});
  return res.status(204).send();
}));

const reservationBaseSchema = z.object({
  idPlace: z.coerce.number().int().positive(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  reservationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide'),
  numberOfPersons: z.coerce.number().int().min(1).max(20),
  message: z.string().trim().max(1000).optional().nullable(),
  seatingPreference: z.enum(['INDOOR', 'TERRACE', 'NON_SMOKING', 'NO_PREFERENCE']).optional().nullable(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  occasion: z.string().trim().max(80).optional().nullable(),
});
const validateFutureReservation = (body: z.infer<typeof reservationBaseSchema>, ctx: z.RefinementCtx) => {
  if (reservationMoment(body.reservationDate, body.reservationTime).getTime() <= Date.now()) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['reservationTime'], message: 'Choisissez une date et une heure futures'});
  }
};
const reservationSchema = reservationBaseSchema.superRefine(validateFutureReservation);
const cancellableStatuses: ReservationStatus[] = [ReservationStatus.PENDING, ReservationStatus.PROPOSED, ReservationStatus.CONFIRMED];
const reservationDto = (r: any) => ({idReservation: r.id, idUser: r.userId, idPlace: r.placeId, reservationDate: r.reservationDate.toISOString().slice(0, 10), reservationTime: r.reservationTime, numberOfPersons: r.numberOfPersons, message: r.message, seatingPreference: r.seatingPreference, allergies: r.allergies ?? [], occasion: r.occasion, cancellationReason: r.cancellationReason, status: r.status, proposedDate: r.proposedDate?.toISOString().slice(0, 10) ?? null, proposedTime: r.proposedTime ?? null, proposalMessage: r.proposalMessage ?? null, checkedInAt: r.checkedInAt ?? null, completedAt: r.completedAt ?? null, noShowMarkedAt: r.noShowMarkedAt ?? null, hasReview: Boolean(r.review), ticketToken: signReservationTicket(r.id, r.userId), ...(r.place ? {...placeDto(r.place), placeAddress: r.place.address} : {})});

const timeToMinutes = (value?: string | null) => {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const ensurePlaceAccess = async (req: Request, res: Response, placeId: number) => {
  const user = await prisma.user.findUnique({where: {id: authId(req)}, select: {role: true}});
  if (user?.role === UserRole.ADMIN) return true;
  if (user?.role === UserRole.ESTABLISHMENT) {
    const manager = await prisma.placeManager.findUnique({where: {userId_placeId: {userId: authId(req), placeId}}});
    if (manager) return true;
  }
  res.status(403).json({message: 'Vous ne gérez pas cet établissement'});
  return false;
};
const ensureScannerAccess = async (req: Request, res: Response, placeId: number) => {
  const user = await prisma.user.findUnique({where: {id: authId(req)}, select: {role: true}});
  if (user?.role === UserRole.ADMIN) return true;
  if (user?.role === UserRole.ESTABLISHMENT || user?.role === UserRole.SCANNER) {
    const assignment = await prisma.placeManager.findUnique({where: {userId_placeId: {userId: authId(req), placeId}}});
    if (assignment) return true;
  }
  res.status(403).json({message: 'Vous ne pouvez pas scanner pour cet établissement'});
  return false;
};
const minutesToTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const scheduleTimes = (schedule?: string | null) => {
  const match = schedule?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  return match ? {openTime: match[1], closeTime: match[2], isClosed: false} : null;
};

const getAvailability = async (db: any, placeId: number, date: string, guests: number, excludedReservationId?: number) => {
  const requestedDate = dateOnly(date);
  const weekday = requestedDate.getUTCDay();
  const previousWeekday = (weekday + 6) % 7;
  const [place, rules, closure, overrides, occupied] = await Promise.all([
    db.place.findUnique({where: {id: placeId}, select: {id: true, name: true, schedule: true, capacityPerSlot: true}}),
    db.placeOpeningHour.findMany({where: {placeId, weekday: {in: [weekday, previousWeekday]}}}),
    db.placeClosure.findUnique({where: {placeId_date: {placeId, date: requestedDate}}}),
    db.placeSlotOverride.findMany({where: {placeId, date: requestedDate}}),
    db.reservation.groupBy({
      by: ['reservationTime'],
      where: {
        placeId,
        reservationDate: requestedDate,
        status: {in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]},
        ...(excludedReservationId ? {id: {not: excludedReservationId}} : {}),
      },
      _sum: {numberOfPersons: true},
    }),
  ]);
  if (!place) return null;
  if (closure) return {placeId, placeName: place.name, date, isClosed: true, closureReason: closure.reason || 'Établissement fermé', slots: []};

  const fallback = scheduleTimes(place.schedule);
  const currentRule = rules.find((rule: any) => rule.weekday === weekday) ?? fallback;
  const previousRule = rules.find((rule: any) => rule.weekday === previousWeekday) ?? fallback;
  const currentOpen = currentRule && !currentRule.isClosed ? timeToMinutes(currentRule.openTime) : null;
  const currentClose = currentRule && !currentRule.isClosed ? timeToMinutes(currentRule.closeTime) : null;
  const previousOpen = previousRule && !previousRule.isClosed ? timeToMinutes(previousRule.openTime) : null;
  const previousClose = previousRule && !previousRule.isClosed ? timeToMinutes(previousRule.closeTime) : null;
  const overrideByTime = new Map(overrides.map((item: any) => [item.time.slice(0, 5), item]));
  const occupiedByTime = new Map(occupied.map((item: any) => [item.reservationTime.slice(0, 5), item._sum.numberOfPersons ?? 0]));
  const slots = [];

  for (let minute = 0; minute < 24 * 60; minute += 30) {
    const inCurrentHours = currentOpen !== null && currentClose !== null && (currentClose > currentOpen ? minute >= currentOpen && minute < currentClose : minute >= currentOpen);
    const inPreviousOvernight = previousOpen !== null && previousClose !== null && previousClose <= previousOpen && minute < previousClose;
    if (!inCurrentHours && !inPreviousOvernight) continue;
    const time = minutesToTime(minute);
    const override: any = overrideByTime.get(time);
    const capacity = Math.max(0, override?.capacity ?? place.capacityPerSlot);
    const used = Number(occupiedByTime.get(time) ?? 0);
    const remainingCapacity = Math.max(0, capacity - used);
    const isPast = reservationMoment(date, time).getTime() <= Date.now();
    const isClosed = Boolean(override?.isClosed);
    const status = isPast ? 'PAST' : isClosed ? 'CLOSED' : remainingCapacity < guests ? 'FULL' : remainingCapacity <= Math.max(2, Math.ceil(capacity * 0.25)) ? 'LIMITED' : 'AVAILABLE';
    slots.push({time, capacity, occupied: used, remainingCapacity, status, available: status === 'AVAILABLE' || status === 'LIMITED'});
  }
  return {placeId, placeName: place.name, date, isClosed: !slots.length, closureReason: slots.length ? null : 'Fermé ce jour', capacityPerSlot: place.capacityPerSlot, guests, slots};
};

app.get('/places/:placeId/availability', asyncRoute(async (req, res) => {
  const query = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    guests: z.coerce.number().int().min(1).max(20).default(1),
  }).parse(req.query);
  const availability = await getAvailability(prisma, id(req.params.placeId), query.date, query.guests);
  if (!availability) return res.status(404).json({message: 'Établissement introuvable'});
  return res.json(availability);
}));

app.get('/admin/places/:placeId/availability-settings', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const place = await prisma.place.findUnique({where: {id: placeId}, include: {openingHours: {orderBy: {weekday: 'asc'}}, closures: {orderBy: {date: 'asc'}}, slotOverrides: {orderBy: [{date: 'asc'}, {time: 'asc'}]}}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  return res.json({placeId, capacityPerSlot: place.capacityPerSlot, openingHours: place.openingHours, closures: place.closures, slotOverrides: place.slotOverrides});
}));

app.put('/admin/places/:placeId/opening-hours', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const body = z.object({
    capacityPerSlot: z.coerce.number().int().min(1).max(500).optional(),
    openingHours: z.array(z.object({weekday: z.number().int().min(0).max(6), openTime: time.nullable().optional(), closeTime: time.nullable().optional(), isClosed: z.boolean().default(false)})).max(7),
  }).parse(req.body);
  await prisma.$transaction(async tx => {
    if (body.capacityPerSlot) await tx.place.update({where: {id: placeId}, data: {capacityPerSlot: body.capacityPerSlot}});
    for (const rule of body.openingHours) {
      if (!rule.isClosed && (!rule.openTime || !rule.closeTime)) throw Object.assign(new Error('Les heures d’ouverture et de fermeture sont obligatoires'), {statusCode: 400});
      await tx.placeOpeningHour.upsert({where: {placeId_weekday: {placeId, weekday: rule.weekday}}, update: rule, create: {...rule, placeId}});
    }
  });
  return res.json({message: 'Horaires enregistrés'});
}));

app.post('/admin/places/:placeId/closures', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const body = z.object({date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(200).optional()}).parse(req.body);
  const closure = await prisma.placeClosure.upsert({where: {placeId_date: {placeId, date: dateOnly(body.date)}}, update: {reason: body.reason}, create: {placeId, date: dateOnly(body.date), reason: body.reason}});
  return res.status(201).json(closure);
}));

app.delete('/admin/places/:placeId/closures/:date', asyncRoute(async (req, res) => {
  if (!(await ensurePlaceAccess(req, res, id(req.params.placeId)))) return;
  const closureDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
  await prisma.placeClosure.deleteMany({where: {placeId: id(req.params.placeId), date: dateOnly(closureDate)}});
  return res.status(204).send();
}));

app.put('/admin/places/:placeId/slot-overrides', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const body = z.object({date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), capacity: z.coerce.number().int().min(0).max(500).nullable().optional(), isClosed: z.boolean().default(false)}).parse(req.body);
  const date = dateOnly(body.date);
  const override = await prisma.placeSlotOverride.upsert({where: {placeId_date_time: {placeId, date, time: body.time}}, update: {capacity: body.capacity, isClosed: body.isClosed}, create: {placeId, date, time: body.time, capacity: body.capacity, isClosed: body.isClosed}});
  return res.json(override);
}));

app.get('/getAllReservationsByUser', asyncRoute(async (req, res) => {
  const rows = await prisma.reservation.findMany({where: {userId: authId(req)}, include: {place: true, review: true}, orderBy: [{reservationDate: 'desc'}, {reservationTime: 'desc'}]});
  return res.json(rows.map(reservationDto));
}));

app.get('/reservations/upcoming', asyncRoute(async (req, res) => {
  const query = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).parse(req.query);
  const rows = await prisma.reservation.findMany({
    where: {
      userId: authId(req),
      status: {in: [ReservationStatus.PENDING, ReservationStatus.PROPOSED, ReservationStatus.CONFIRMED]},
      reservationDate: {gte: dateOnly(query.date)},
    },
    include: {place: true},
    orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}],
  });
  const row = rows.find(item => {
    const day = item.reservationDate.toISOString().slice(0, 10);
    return day > query.date || (day === query.date && item.reservationTime.slice(0, 5) > query.time);
  });
  return res.json(row ? reservationDto(row) : null);
}));

app.get('/getReservationById/:reservationId', asyncRoute(async (req, res) => {
  const row = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}, include: {place: true}});
  if (!row) return res.status(404).json({message: 'Réservation introuvable'});
  return res.json(reservationDto(row));
}));

app.post('/addReservation', asyncRoute(async (req, res) => {
  const body = reservationSchema.parse(req.body);
  const row = await prisma.$transaction(async tx => {
    const availability = await getAvailability(tx, body.idPlace, body.reservationDate, body.numberOfPersons);
    if (!availability) throw Object.assign(new Error('Établissement introuvable'), {statusCode: 404});
    const slot = availability.slots.find((item: any) => item.time === body.reservationTime.slice(0, 5));
    if (!slot?.available) throw Object.assign(new Error(slot?.status === 'FULL' ? 'Ce créneau est complet' : 'Ce créneau n’est pas disponible'), {statusCode: 409});
    const created = await tx.reservation.create({data: {userId: authId(req), placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message, seatingPreference: body.seatingPreference, allergies: body.allergies, occasion: body.occasion}});
    await tx.notification.create({data: {userId: authId(req), title: 'Demande envoyée', message: `Votre réservation du ${body.reservationDate} à ${body.reservationTime} est en attente.`}});
    return tx.reservation.findUniqueOrThrow({where: {id: created.id}, include: {place: true}});
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
  return res.status(201).json(reservationDto(row));
}));

app.put('/updateReservation', asyncRoute(async (req, res) => {
  const body = reservationBaseSchema.extend({idReservation: z.coerce.number().int().positive()}).superRefine(validateFutureReservation).parse(req.body);
  const existing = await prisma.reservation.findFirst({where: {id: body.idReservation, userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (existing.status !== ReservationStatus.PENDING) return res.status(409).json({message: 'Seule une réservation en attente peut être modifiée'});
  const row = await prisma.$transaction(async tx => {
    const availability = await getAvailability(tx, body.idPlace, body.reservationDate, body.numberOfPersons, existing.id);
    const slot = availability?.slots.find((item: any) => item.time === body.reservationTime.slice(0, 5));
    if (!slot?.available) throw Object.assign(new Error(slot?.status === 'FULL' ? 'Ce créneau est complet' : 'Ce créneau n’est pas disponible'), {statusCode: 409});
    const updated = await tx.reservation.update({where: {id: existing.id}, data: {placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message, seatingPreference: body.seatingPreference, allergies: body.allergies, occasion: body.occasion}});
    await tx.notification.create({data: {userId: authId(req), title: 'Réservation modifiée', message: `Votre demande est maintenant prévue le ${body.reservationDate} à ${body.reservationTime}.`}});
    return updated;
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
  return res.json(reservationDto(row));
}));

app.patch('/reservations/:reservationId/cancel', asyncRoute(async (req, res) => {
  const existing = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (!cancellableStatuses.includes(existing.status)) return res.status(409).json({message: 'Cette réservation ne peut plus être annulée'});
  const body = z.object({reason: z.string().trim().max(300).optional()}).parse(req.body ?? {});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.CANCELLED, cancellationReason: body.reason, proposedDate: null, proposedTime: null, proposalMessage: null}});
  await notify(authId(req), 'Réservation annulée', `Votre réservation du ${row.reservationDate.toISOString().slice(0, 10)} à ${row.reservationTime} a été annulée.`);
  return res.json(reservationDto(row));
}));

app.post('/reservations/reminders/sync', asyncRoute(async (req, res) => {
  const clientNow = z.object({date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()}).parse(req.body ?? {});
  const systemNow = new Date();
  const today = clientNow.date ?? systemNow.toISOString().slice(0, 10);
  const time = clientNow.time ?? systemNow.toISOString().slice(11, 16);
  const start = Date.parse(`${today}T${time}:00.000Z`);
  const end = start + 24 * 60 * 60 * 1000;
  const lastDay = new Date(end).toISOString().slice(0, 10);
  const rows = await prisma.reservation.findMany({where: {userId: authId(req), status: ReservationStatus.CONFIRMED, reservationDate: {gte: dateOnly(today), lte: dateOnly(lastDay)}}, include: {place: true}});
  let created = 0;
  for (const row of rows) {
    const day = row.reservationDate.toISOString().slice(0, 10);
    const moment = Date.parse(`${day}T${row.reservationTime.slice(0, 5)}:00.000Z`);
    if (moment <= start || moment > end) continue;
    const result = await prisma.notification.createMany({data: [{userId: authId(req), title: 'Rappel de réservation', message: `Votre table chez ${row.place.name} est prévue le ${day} à ${row.reservationTime.slice(0, 5)}.`, type: 'RESERVATION_REMINDER', referenceKey: String(row.id)}], skipDuplicates: true});
    created += result.count;
  }
  return res.json({created});
}));

app.patch('/reservations/:reservationId/accept-proposal', asyncRoute(async (req, res) => {
  const existing = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}, include: {place: true}});
  if (!existing || existing.status !== ReservationStatus.PROPOSED || !existing.proposedDate || !existing.proposedTime) return res.status(409).json({message: 'Aucune proposition active'});
  const date = existing.proposedDate.toISOString().slice(0, 10);
  const row = await prisma.$transaction(async tx => {
    const availability = await getAvailability(tx, existing.placeId, date, existing.numberOfPersons, existing.id);
    const slot = availability?.slots.find((item: any) => item.time === existing.proposedTime?.slice(0, 5));
    if (!slot?.available) throw Object.assign(new Error('Le créneau proposé n’est plus disponible'), {statusCode: 409});
    return tx.reservation.update({where: {id: existing.id}, data: {reservationDate: existing.proposedDate!, reservationTime: existing.proposedTime!, status: ReservationStatus.CONFIRMED, proposedDate: null, proposedTime: null, proposalMessage: null}});
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
  await notify(row.userId, 'Nouvel horaire confirmé', `Votre réservation chez ${existing.place.name} est confirmée le ${date} à ${row.reservationTime}.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

app.patch('/reservations/:reservationId/decline-proposal', asyncRoute(async (req, res) => {
  const body = z.object({reason: z.string().trim().max(300).optional()}).parse(req.body ?? {});
  const existing = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req), status: ReservationStatus.PROPOSED}, include: {place: true}});
  if (!existing) return res.status(409).json({message: 'Aucune proposition active'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.CANCELLED, cancellationReason: body.reason ?? 'Nouvel horaire refusé', proposedDate: null, proposedTime: null, proposalMessage: null}});
  await notify(row.userId, 'Proposition refusée', `La proposition de ${existing.place.name} a été refusée.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

app.get('/pro/me', asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({where: {id: authId(req)}, include: {managedPlaces: {include: {place: {include: {categories: true}}}}}});
  if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.ESTABLISHMENT && user.role !== UserRole.SCANNER)) return res.status(403).json({message: 'Compte Barmej Pro requis'});
  const places = user.role === UserRole.ADMIN ? await prisma.place.findMany({include: {categories: true}, orderBy: {name: 'asc'}}) : user.managedPlaces.map(item => item.place);
  return res.json({...userDto(user), places: places.map(placeDto)});
}));

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
const proPlaceSchema = z.object({
  categoryIds: z.array(z.coerce.number().int().positive()).min(1).max(8),
  name: z.string().trim().min(2).max(120),
  subtitle: nullableText(180),
  image: z.union([z.string().trim().url('URL de photo invalide').max(2000), z.literal(''), z.null()]).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  phone: nullableText(40),
  address: nullableText(300),
  email: z.union([z.string().trim().email('Email invalide'), z.literal(''), z.null()]).optional(),
  description: nullableText(3000),
  outfit: nullableText(200),
  musicStyle: nullableText(200),
  happyHour: nullableText(200),
  schedule: nullableText(200),
  favorableDay: nullableText(100),
  favorableHour: nullableText(100),
  averagePrice: z.union([z.coerce.number().int().min(0).max(10000), z.null()]).optional(),
  capacityPerSlot: z.coerce.number().int().min(1).max(500),
  cuisineType: nullableText(120),
  ambienceTags: z.array(z.string().trim().min(1).max(50)).max(12).default([]),
});

app.get('/pro/places/:placeId', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const place = await prisma.place.findUnique({where: {id: placeId}, include: {categories: true}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  return res.json(placeDto(place));
}));

app.get('/pro/places/:placeId/completion', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const place = await prisma.place.findUnique({where: {id: placeId}, include: {categories: true, media: true, openingHours: true, events: {where: {active: true}}}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  const imageMedia = place.media.filter(media => media.type !== PlaceMediaType.VIDEO);
  const checks = [
    {key: 'identity', label: 'Ajoutez une phrase de présentation', points: 10, complete: Boolean(place.name.trim() && place.subtitle?.trim()), section: 'Essentiel', priority: 1},
    {key: 'description', label: 'Rédigez une description détaillée (80 caractères minimum)', points: 10, complete: (place.description?.trim().length ?? 0) >= 80, section: 'Expérience', priority: 1},
    {key: 'contact', label: 'Ajoutez un téléphone et un email public', points: 10, complete: Boolean(place.phone?.trim() && place.email?.trim()), section: 'Contact', priority: 1},
    {key: 'location', label: 'Vérifiez l’adresse et la position sur la carte', points: 10, complete: Boolean(place.address?.trim() && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)), section: 'Contact', priority: 1},
    {key: 'categories', label: 'Sélectionnez au moins deux catégories', points: 10, complete: place.categories.length >= 2, section: 'Essentiel', priority: 2},
    {key: 'hours', label: 'Configurez au moins cinq jours d’ouverture', points: 15, complete: place.openingHours.filter(rule => !rule.isClosed).length >= 5 || Boolean(place.schedule?.trim()), section: 'Horaires', priority: 1},
    {key: 'cover', label: 'Ajoutez une photo de couverture', points: 5, complete: Boolean(place.image || imageMedia.some(media => media.type === PlaceMediaType.COVER)), section: 'Essentiel', priority: 1},
    {key: 'gallery', label: 'Présentez votre établissement avec au moins trois photos', points: 10, complete: imageMedia.length >= 3, section: 'Essentiel', priority: 2},
    {key: 'video', label: 'Ajoutez une courte vidéo de présentation', points: 10, complete: place.media.some(media => media.type === PlaceMediaType.VIDEO), section: 'Essentiel', priority: 3},
    {key: 'capacity', label: 'Définissez la capacité réelle de vos créneaux', points: 5, complete: place.capacityPerSlot > 0, section: 'Capacité', priority: 2},
    {key: 'event', label: 'Publiez un événement ou une offre active', points: 5, complete: place.events.length > 0, section: 'Événements', priority: 3},
  ];
  const score = checks.filter(check => check.complete).reduce((sum, check) => sum + check.points, 0);
  return res.json({score, level: score >= 90 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 45 ? 'IMPROVE' : 'INCOMPLETE', completed: checks.filter(check => check.complete).length, total: checks.length, recommendations: checks.filter(check => !check.complete).sort((a, b) => a.priority - b.priority || b.points - a.points).map(({complete: _complete, ...check}) => check)});
}));

app.put('/pro/places/:placeId', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const body = proPlaceSchema.parse(req.body);
  const categoryIds = [...new Set(body.categoryIds)];
  const categoryCount = await prisma.category.count({where: {id: {in: categoryIds}}});
  if (categoryCount !== categoryIds.length) return res.status(400).json({message: 'Une ou plusieurs catégories sont invalides'});
  const clean = (value?: string | null) => value?.trim() || null;
  const place = await prisma.place.update({where: {id: placeId}, data: {
    categoryId: categoryIds[0],
    name: body.name,
    subtitle: clean(body.subtitle),
    image: clean(body.image),
    latitude: body.latitude,
    longitude: body.longitude,
    phone: clean(body.phone),
    address: clean(body.address),
    email: clean(body.email),
    description: clean(body.description),
    outfit: clean(body.outfit),
    musicStyle: clean(body.musicStyle),
    happyHour: clean(body.happyHour),
    schedule: clean(body.schedule),
    favorableDay: clean(body.favorableDay),
    favorableHour: clean(body.favorableHour),
    averagePrice: body.averagePrice ?? null,
    capacityPerSlot: body.capacityPerSlot,
    cuisineType: clean(body.cuisineType),
    ambienceTags: [...new Set(body.ambienceTags.map(tag => tag.trim()).filter(Boolean))],
    categories: {deleteMany: {}, create: categoryIds.map(categoryId => ({categoryId}))},
  }, include: {categories: true}});
  return res.json({message: 'Fiche établissement mise à jour', place: placeDto(place)});
}));

const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(2000),
  startDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  endDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).optional(),
  startTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal(''), z.null()]).optional(),
  endTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal(''), z.null()]).optional(),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.endDate && value.startDate && value.endDate < value.startDate) ctx.addIssue({code: z.ZodIssueCode.custom, path: ['endDate'], message: 'La date de fin doit suivre la date de début'});
  if ((value.startTime && !value.startDate) || (value.endTime && !value.startDate)) ctx.addIssue({code: z.ZodIssueCode.custom, path: ['startDate'], message: 'Ajoutez une date pour utiliser les horaires'});
});

app.get('/pro/places/:placeId/events', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const events = await prisma.placeEvent.findMany({where: {placeId}, orderBy: [{active: 'desc'}, {startDate: 'asc'}, {createdAt: 'desc'}]});
  return res.json(events.map(eventDto));
}));

app.post('/pro/places/:placeId/events', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const body = eventSchema.parse(req.body);
  const event = await prisma.placeEvent.create({data: {
    placeId,
    title: body.title,
    description: body.description,
    startDate: body.startDate ? dateOnly(body.startDate) : null,
    endDate: body.endDate ? dateOnly(body.endDate) : null,
    startTime: body.startTime || null,
    endTime: body.endTime || null,
    active: body.active,
  }});
  return res.status(201).json(eventDto(event));
}));

app.put('/pro/places/:placeId/events/:eventId', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const eventId = id(req.params.eventId);
  const existing = await prisma.placeEvent.findFirst({where: {id: eventId, placeId}});
  if (!existing) return res.status(404).json({message: 'Événement introuvable'});
  const body = eventSchema.parse(req.body);
  const event = await prisma.placeEvent.update({where: {id: eventId}, data: {
    title: body.title,
    description: body.description,
    startDate: body.startDate ? dateOnly(body.startDate) : null,
    endDate: body.endDate ? dateOnly(body.endDate) : null,
    startTime: body.startTime || null,
    endTime: body.endTime || null,
    active: body.active,
  }});
  return res.json(eventDto(event));
}));

app.delete('/pro/places/:placeId/events/:eventId', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const deleted = await prisma.placeEvent.deleteMany({where: {id: id(req.params.eventId), placeId}});
  if (!deleted.count) return res.status(404).json({message: 'Événement introuvable'});
  return res.status(204).send();
}));

app.get('/pro/places/:placeId/media', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const media = await prisma.placeMedia.findMany({where: {placeId}, orderBy: [{type: 'asc'}, {sortOrder: 'asc'}, {createdAt: 'asc'}]});
  return res.json(media.map(mediaDto));
}));

app.post('/pro/places/:placeId/media/signature', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  if (!cloudinaryReady()) return res.status(503).json({message: 'Cloudinary n’est pas encore configuré sur le backend'});
  const type = z.enum(['COVER', 'GALLERY', 'VIDEO']).default('GALLERY').parse(req.body?.type);
  const imageCount = await prisma.placeMedia.count({where: {placeId, type: {in: [PlaceMediaType.COVER, PlaceMediaType.GALLERY]}}});
  const hasCover = type === 'COVER' && await prisma.placeMedia.count({where: {placeId, type: PlaceMediaType.COVER}}) > 0;
  if (type !== 'VIDEO' && imageCount >= 5 && !hasCover) return res.status(409).json({message: 'L’établissement est limité à 5 photos, couverture comprise'});
  if (type === 'VIDEO' && await prisma.placeMedia.count({where: {placeId, type: PlaceMediaType.VIDEO}}) >= 1) return res.status(409).json({message: 'Une seule vidéo de présentation est autorisée'});
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `barmej/places/${placeId}/${type.toLowerCase()}`;
  const signature = cloudinary.utils.api_sign_request({folder, timestamp}, config.CLOUDINARY_API_SECRET!);
  const resourceType = type === 'VIDEO' ? 'video' : 'image';
  return res.json({cloudName: config.CLOUDINARY_CLOUD_NAME, apiKey: config.CLOUDINARY_API_KEY, timestamp, folder, signature, resourceType, uploadUrl: `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`});
}));

app.post('/pro/places/:placeId/media/complete', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  if (!cloudinaryReady()) return res.status(503).json({message: 'Cloudinary n’est pas encore configuré sur le backend'});
  const body = z.object({
    publicId: z.string().trim().min(3).max(500),
    version: z.coerce.number().int().positive(),
    signature: z.string().regex(/^[a-f0-9]{40}$/i),
    type: z.enum(['COVER', 'GALLERY', 'VIDEO']),
    width: z.coerce.number().int().positive().max(20000).optional(),
    height: z.coerce.number().int().positive().max(20000).optional(),
    bytes: z.coerce.number().int().positive().optional(),
    format: z.string().trim().max(20).optional(),
    duration: z.coerce.number().positive().max(60).optional(),
    keywords: z.array(z.string()).optional(),
  }).parse(req.body);
  const expected = cloudinary.utils.api_sign_request({public_id: body.publicId, version: body.version}, config.CLOUDINARY_API_SECRET!);
  if (expected !== body.signature) return res.status(400).json({message: 'Réponse Cloudinary invalide'});
  if (!body.publicId.startsWith(`barmej/places/${placeId}/`)) return res.status(403).json({message: 'Ce média n’appartient pas à cet établissement'});
  const isVideo = body.type === 'VIDEO';
  const keywords = isVideo ? videoKeywordsSchema.parse(body.keywords ?? []) : [];
  if (isVideo && !body.duration) {
    await cloudinary.uploader.destroy(body.publicId, {resource_type: 'video'}).catch(() => undefined);
    return res.status(400).json({message: 'La durée de la vidéo est obligatoire'});
  }
  const currentImages = await prisma.placeMedia.count({where: {placeId, type: {in: [PlaceMediaType.COVER, PlaceMediaType.GALLERY]}}});
  const previousCover = body.type === 'COVER' ? await prisma.placeMedia.findFirst({where: {placeId, type: PlaceMediaType.COVER}}) : null;
  if (!isVideo && currentImages >= 5 && !previousCover) {
    await cloudinary.uploader.destroy(body.publicId).catch(() => undefined);
    return res.status(409).json({message: 'L’établissement est limité à 5 photos, couverture comprise'});
  }
  if (isVideo && await prisma.placeMedia.count({where: {placeId, type: PlaceMediaType.VIDEO}}) >= 1) {
    await cloudinary.uploader.destroy(body.publicId, {resource_type: 'video'}).catch(() => undefined);
    return res.status(409).json({message: 'Une seule vidéo de présentation est autorisée'});
  }
  const maxBytes = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
  if ((body.bytes ?? 0) > maxBytes) {
    await cloudinary.uploader.destroy(body.publicId, {resource_type: isVideo ? 'video' : 'image'}).catch(() => undefined);
    return res.status(413).json({message: isVideo ? 'La vidéo dépasse la limite de 50 Mo' : 'La photo dépasse la limite de 8 Mo'});
  }
  const secureUrl = cloudinary.url(body.publicId, {secure: true, version: body.version, format: body.format, resource_type: isVideo ? 'video' : 'image'});
  const media = await prisma.$transaction(async tx => {
    if (body.type === 'COVER') await tx.placeMedia.deleteMany({where: {placeId, type: PlaceMediaType.COVER}});
    const created = await tx.placeMedia.upsert({where: {publicId: body.publicId}, update: {type: body.type, secureUrl, width: body.width, height: body.height, bytes: body.bytes, format: body.format, duration: body.duration, keywords}, create: {placeId, publicId: body.publicId, secureUrl, type: body.type, width: body.width, height: body.height, bytes: body.bytes, format: body.format, duration: body.duration, keywords}});
    if (body.type === 'COVER') await tx.place.update({where: {id: placeId}, data: {image: secureUrl}});
    return created;
  });
  if (previousCover && previousCover.publicId !== body.publicId) await cloudinary.uploader.destroy(previousCover.publicId, {invalidate: true}).catch(() => undefined);
  return res.status(201).json(mediaDto(media));
}));

app.patch('/pro/places/:placeId/media/:mediaId/keywords', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const keywords = videoKeywordsSchema.parse(req.body?.keywords);
  const media = await prisma.placeMedia.findFirst({where: {id: id(req.params.mediaId), placeId, type: PlaceMediaType.VIDEO}});
  if (!media) return res.status(404).json({message: 'Vidéo introuvable'});
  const updated = await prisma.placeMedia.update({where: {id: media.id}, data: {keywords}});
  return res.json(mediaDto(updated));
}));

app.patch('/pro/places/:placeId/media/:mediaId/cover', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const media = await prisma.placeMedia.findFirst({where: {id: id(req.params.mediaId), placeId}});
  if (!media || media.type === PlaceMediaType.VIDEO) return res.status(404).json({message: 'Photo introuvable'});
  await prisma.$transaction([
    prisma.placeMedia.updateMany({where: {placeId, type: PlaceMediaType.COVER}, data: {type: PlaceMediaType.GALLERY}}),
    prisma.placeMedia.update({where: {id: media.id}, data: {type: PlaceMediaType.COVER}}),
    prisma.place.update({where: {id: placeId}, data: {image: media.secureUrl}}),
  ]);
  return res.json({...mediaDto(media), type: PlaceMediaType.COVER});
}));

app.delete('/pro/places/:placeId/media/:mediaId', asyncRoute(async (req, res) => {
  const placeId = id(req.params.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const media = await prisma.placeMedia.findFirst({where: {id: id(req.params.mediaId), placeId}});
  if (!media) return res.status(404).json({message: 'Photo introuvable'});
  if (cloudinaryReady()) await cloudinary.uploader.destroy(media.publicId, {invalidate: true, resource_type: media.type === PlaceMediaType.VIDEO ? 'video' : 'image'});
  await prisma.$transaction(async tx => {
    await tx.placeMedia.delete({where: {id: media.id}});
    if (media.type === PlaceMediaType.COVER) {
      const replacement = await tx.placeMedia.findFirst({where: {placeId, type: PlaceMediaType.GALLERY}, orderBy: [{sortOrder: 'asc'}, {createdAt: 'asc'}]});
      if (replacement) await tx.placeMedia.update({where: {id: replacement.id}, data: {type: PlaceMediaType.COVER}});
      await tx.place.update({where: {id: placeId}, data: {image: replacement?.secureUrl ?? null}});
    }
  });
  return res.status(204).send();
}));

const expireLoyaltyRedemptions = () => prisma.loyaltyRedemption.updateMany({
  where: {status: LoyaltyRedemptionStatus.PENDING, expiresAt: {lte: new Date()}},
  data: {status: LoyaltyRedemptionStatus.EXPIRED},
});
const rewardDto = (reward: any, balance = 0) => ({
  id: reward.id,
  placeId: reward.placeId,
  name: reward.name,
  description: reward.description,
  pointsCost: reward.pointsCost,
  active: reward.active,
  stock: reward.stock,
  expiresAt: reward.expiresAt,
  available: reward.active && (reward.stock == null || reward.stock > 0) && (!reward.expiresAt || reward.expiresAt > new Date()),
  canClaim: balance >= reward.pointsCost && reward.active && (reward.stock == null || reward.stock > 0) && (!reward.expiresAt || reward.expiresAt > new Date()),
  pointsMissing: Math.max(0, reward.pointsCost - balance),
});

app.get('/loyalty', asyncRoute(async (req, res) => {
  await expireLoyaltyRedemptions();
  const accounts = await prisma.loyaltyAccount.findMany({
    where: {userId: authId(req)},
    include: {place: {include: {loyaltyProgram: {include: {rewards: {where: {active: true}, orderBy: {pointsCost: 'asc'}}}}}}},
    orderBy: {balance: 'desc'},
  });
  return res.json(accounts.filter(account => account.place.loyaltyProgram?.enabled).map(account => {
    const program = account.place.loyaltyProgram!;
    const rewards = program.rewards.map(reward => rewardDto(reward, account.balance));
    const nextReward = rewards.find(reward => reward.available && reward.pointsCost > account.balance) ?? rewards.find(reward => reward.available) ?? null;
    return {
      placeId: account.placeId,
      placeName: account.place.name,
      placeImage: account.place.image,
      balance: account.balance,
      lifetimePoints: account.lifetimePoints,
      pointsPerVisit: program.pointsPerVisit,
      rewards,
      nextReward,
      progress: nextReward ? Math.min(100, Math.round((account.balance / nextReward.pointsCost) * 100)) : 100,
    };
  }));
}));

app.get('/loyalty/:placeId', asyncRoute(async (req, res) => {
  await expireLoyaltyRedemptions();
  const placeId = id(req.params.placeId);
  const [program, account, redemptions, transactions] = await Promise.all([
    prisma.loyaltyProgram.findUnique({where: {placeId}, include: {place: true, rewards: {where: {active: true}, orderBy: {pointsCost: 'asc'}}}}),
    prisma.loyaltyAccount.findUnique({where: {userId_placeId: {userId: authId(req), placeId}}}),
    prisma.loyaltyRedemption.findMany({where: {userId: authId(req), placeId}, include: {reward: true}, orderBy: {createdAt: 'desc'}, take: 20}),
    prisma.loyaltyTransaction.findMany({where: {userId: authId(req), placeId}, orderBy: {createdAt: 'desc'}, take: 30}),
  ]);
  if (!program?.enabled) return res.status(404).json({message: 'Programme de fidélité indisponible'});
  const balance = account?.balance ?? 0;
  return res.json({placeId, placeName: program.place.name, placeImage: program.place.image, balance, lifetimePoints: account?.lifetimePoints ?? 0, pointsPerVisit: program.pointsPerVisit, rewards: program.rewards.map(reward => rewardDto(reward, balance)), redemptions, transactions});
}));

app.post('/loyalty/rewards/:rewardId/claim', asyncRoute(async (req, res) => {
  await expireLoyaltyRedemptions();
  const reward = await prisma.loyaltyReward.findUnique({where: {id: id(req.params.rewardId)}, include: {program: true, place: true}});
  if (!reward || !reward.program.enabled || !reward.active) return res.status(404).json({message: 'Récompense indisponible'});
  if (reward.expiresAt && reward.expiresAt <= new Date()) return res.status(409).json({message: 'Cette récompense a expiré'});
  if (reward.stock !== null && reward.stock <= 0) return res.status(409).json({message: 'Cette récompense est épuisée'});
  const account = await prisma.loyaltyAccount.findUnique({where: {userId_placeId: {userId: authId(req), placeId: reward.placeId}}});
  if (!account || account.balance < reward.pointsCost) return res.status(409).json({message: `Il vous manque ${reward.pointsCost - (account?.balance ?? 0)} points`});
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const redemption = await prisma.$transaction(async tx => {
    await tx.loyaltyRedemption.updateMany({where: {userId: authId(req), placeId: reward.placeId, status: LoyaltyRedemptionStatus.PENDING}, data: {status: LoyaltyRedemptionStatus.CANCELLED}});
    return tx.loyaltyRedemption.create({data: {userId: authId(req), placeId: reward.placeId, rewardId: reward.id, token: `reward:${randomUUID()}`, pointsCost: reward.pointsCost, expiresAt}, include: {reward: true, place: true}});
  });
  return res.status(201).json(redemption);
}));

app.post('/loyalty/redemptions/:redemptionId/cancel', asyncRoute(async (req, res) => {
  const redemption = await prisma.loyaltyRedemption.findFirst({where: {id: id(req.params.redemptionId), userId: authId(req), status: LoyaltyRedemptionStatus.PENDING}});
  if (!redemption) return res.status(404).json({message: 'Bon actif introuvable'});
  return res.json(await prisma.loyaltyRedemption.update({where: {id: redemption.id}, data: {status: LoyaltyRedemptionStatus.CANCELLED}}));
}));

app.get('/pro/loyalty', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const program = await prisma.loyaltyProgram.upsert({where: {placeId}, update: {}, create: {placeId}, include: {rewards: {orderBy: {pointsCost: 'asc'}}}});
  const [members, pointsIssued] = await Promise.all([
    prisma.loyaltyAccount.count({where: {placeId}}),
    prisma.loyaltyTransaction.aggregate({where: {placeId, type: LoyaltyTransactionType.EARN}, _sum: {points: true}}),
  ]);
  return res.json({...program, members, pointsIssued: pointsIssued._sum.points ?? 0});
}));

app.put('/pro/loyalty', asyncRoute(async (req, res) => {
  const body = z.object({placeId: z.coerce.number().int().positive(), enabled: z.boolean(), pointsPerVisit: z.coerce.number().int().min(1).max(1000)}).parse(req.body);
  if (!(await ensurePlaceAccess(req, res, body.placeId))) return;
  const program = await prisma.loyaltyProgram.upsert({where: {placeId: body.placeId}, update: body, create: body});
  await audit(req, body.placeId, 'LOYALTY_PROGRAM_UPDATED', 'LOYALTY_PROGRAM', program.id, {enabled: body.enabled, pointsPerVisit: body.pointsPerVisit});
  return res.json(program);
}));

const rewardInput = z.object({placeId: z.coerce.number().int().positive(), name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).nullish(), pointsCost: z.coerce.number().int().min(1).max(1_000_000), active: z.boolean().default(true), stock: z.coerce.number().int().min(0).max(1_000_000).nullish(), expiresAt: z.string().datetime().nullish()});

app.post('/pro/loyalty/rewards', asyncRoute(async (req, res) => {
  const body = rewardInput.parse(req.body);
  if (!(await ensurePlaceAccess(req, res, body.placeId))) return;
  const program = await prisma.loyaltyProgram.upsert({where: {placeId: body.placeId}, update: {}, create: {placeId: body.placeId}});
  const reward = await prisma.loyaltyReward.create({data: {programId: program.id, placeId: body.placeId, name: body.name, description: body.description || null, pointsCost: body.pointsCost, active: body.active, stock: body.stock ?? null, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null}});
  await audit(req, body.placeId, 'LOYALTY_REWARD_CREATED', 'LOYALTY_REWARD', reward.id, {name: reward.name, pointsCost: reward.pointsCost});
  return res.status(201).json(reward);
}));

app.patch('/pro/loyalty/rewards/:rewardId', asyncRoute(async (req, res) => {
  const existing = await prisma.loyaltyReward.findUnique({where: {id: id(req.params.rewardId)}});
  if (!existing) return res.status(404).json({message: 'Récompense introuvable'});
  if (!(await ensurePlaceAccess(req, res, existing.placeId))) return;
  const body = rewardInput.omit({placeId: true}).partial().parse(req.body);
  const reward = await prisma.loyaltyReward.update({where: {id: existing.id}, data: {...body, description: body.description === undefined ? undefined : body.description || null, stock: body.stock === undefined ? undefined : body.stock, expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null}});
  await audit(req, existing.placeId, 'LOYALTY_REWARD_UPDATED', 'LOYALTY_REWARD', reward.id, {name: reward.name, pointsCost: reward.pointsCost, active: reward.active});
  return res.json(reward);
}));

app.delete('/pro/loyalty/rewards/:rewardId', asyncRoute(async (req, res) => {
  const reward = await prisma.loyaltyReward.findUnique({where: {id: id(req.params.rewardId)}});
  if (!reward) return res.status(404).json({message: 'Récompense introuvable'});
  if (!(await ensurePlaceAccess(req, res, reward.placeId))) return;
  await prisma.loyaltyReward.update({where: {id: reward.id}, data: {active: false}});
  await audit(req, reward.placeId, 'LOYALTY_REWARD_ARCHIVED', 'LOYALTY_REWARD', reward.id);
  return res.status(204).send();
}));

app.get('/pro/loyalty/members', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const accounts = await prisma.loyaltyAccount.findMany({where: {placeId}, include: {user: {select: {firstName: true, lastName: true, email: true, mobile: true}}}, orderBy: [{balance: 'desc'}, {updatedAt: 'desc'}], take: 100});
  return res.json(accounts.map(account => ({id: account.id, customerName: `${account.user.firstName} ${account.user.lastName}`.trim(), email: account.user.email, mobile: account.user.mobile, balance: account.balance, lifetimePoints: account.lifetimePoints, updatedAt: account.updatedAt})));
}));

app.post('/pro/loyalty/members/:accountId/redeem', asyncRoute(async (req, res) => {
  return res.status(410).json({message: 'La validation manuelle est désactivée. Scannez le QR code temporaire du client.'});
}));

app.post('/pro/loyalty/redemptions/scan', asyncRoute(async (req, res) => {
  await expireLoyaltyRedemptions();
  const {value} = z.object({value: z.string().trim().min(8)}).parse(req.body);
  const redemption = await prisma.loyaltyRedemption.findUnique({where: {token: value}, include: {reward: true, place: true, user: true}});
  if (!redemption) return res.status(404).json({message: 'QR code de récompense invalide'});
  if (!(await ensureScannerAccess(req, res, redemption.placeId))) return;
  if (redemption.status !== LoyaltyRedemptionStatus.PENDING) return res.status(409).json({message: 'Ce bon a déjà été utilisé ou annulé'});
  if (redemption.expiresAt <= new Date()) return res.status(410).json({message: 'Ce QR code a expiré'});
  if (!redemption.reward.active) return res.status(409).json({message: 'Cette récompense a été désactivée'});
  if (redemption.reward.stock !== null && redemption.reward.stock <= 0) return res.status(409).json({message: 'Cette récompense est épuisée'});
  const result = await prisma.$transaction(async tx => {
    const account = await tx.loyaltyAccount.findUnique({where: {userId_placeId: {userId: redemption.userId, placeId: redemption.placeId}}});
    if (!account || account.balance < redemption.pointsCost) throw Object.assign(new Error('Le client ne possède plus assez de points'), {statusCode: 409});
    const updatedRedemption = await tx.loyaltyRedemption.updateMany({where: {id: redemption.id, status: LoyaltyRedemptionStatus.PENDING}, data: {status: LoyaltyRedemptionStatus.REDEEMED, redeemedAt: new Date()}});
    if (!updatedRedemption.count) throw Object.assign(new Error('Ce bon vient déjà d’être utilisé'), {statusCode: 409});
    const updatedAccount = await tx.loyaltyAccount.update({where: {id: account.id}, data: {balance: {decrement: redemption.pointsCost}}});
    await tx.loyaltyTransaction.create({data: {userId: redemption.userId, placeId: redemption.placeId, type: LoyaltyTransactionType.REDEEM, points: -redemption.pointsCost, note: redemption.reward.name}});
    if (redemption.reward.stock !== null) await tx.loyaltyReward.update({where: {id: redemption.rewardId}, data: {stock: {decrement: 1}}});
    return updatedAccount;
  });
  await audit(req, redemption.placeId, 'LOYALTY_REWARD_REDEEMED', 'LOYALTY_REDEMPTION', redemption.id, {rewardName: redemption.reward.name, points: redemption.pointsCost});
  await notify(redemption.userId, 'Récompense utilisée', `${redemption.reward.name} a été validée chez ${redemption.place.name}. Il vous reste ${result.balance} points.`);
  return res.json({kind: 'LOYALTY_REWARD', rewardName: redemption.reward.name, customerName: `${redemption.user.firstName} ${redemption.user.lastName}`.trim(), placeName: redemption.place.name, balance: result.balance});
}));

app.get('/pro/dashboard', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  await markLateReservationsAsNoShow(prisma, placeId);
  const today = dateOnly(new Date().toISOString().slice(0, 10));
  const [pending, confirmedToday, guestsToday, waitlist, upcoming] = await Promise.all([
    prisma.reservation.count({where: {placeId, status: ReservationStatus.PENDING}}),
    prisma.reservation.count({where: {placeId, reservationDate: today, status: ReservationStatus.CONFIRMED}}),
    prisma.reservation.aggregate({where: {placeId, reservationDate: today, status: ReservationStatus.CONFIRMED}, _sum: {numberOfPersons: true}}),
    prisma.waitlistEntry.count({where: {placeId, status: WaitlistStatus.WAITING}}),
    prisma.reservation.findMany({where: {placeId, reservationDate: {gte: today}, status: {in: [ReservationStatus.PENDING, ReservationStatus.PROPOSED, ReservationStatus.CONFIRMED]}}, include: {user: true, place: true}, orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}], take: 6}),
  ]);
  return res.json({pending, confirmedToday, guestsToday: guestsToday._sum.numberOfPersons ?? 0, waitlist, upcoming: upcoming.map(row => ({...reservationDto(row), customerName: `${row.user.firstName} ${row.user.lastName}`.trim(), customerMobile: row.user.mobile}))});
}));

app.get('/pro/statistics', asyncRoute(async (req, res) => {
  const query = z.object({
    placeId: z.coerce.number().int().positive(),
    days: z.coerce.number().int().min(7).max(365).default(30),
  }).parse(req.query);
  if (!(await ensurePlaceAccess(req, res, query.placeId))) return;
  const start = dateOnly(new Date(Date.now() - (query.days - 1) * 86_400_000).toISOString().slice(0, 10));
  const rows = await prisma.reservation.findMany({
    where: {placeId: query.placeId, reservationDate: {gte: start}},
    select: {userId: true, reservationDate: true, reservationTime: true, numberOfPersons: true, status: true},
    orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}],
  });
  const [feedEvents, sponsoredImpressions] = await Promise.all([
    prisma.feedEvent.findMany({
      where: {placeId: query.placeId, occurredAt: {gte: start}},
      select: {type: true, userId: true, videoId: true, watchMs: true, occurredAt: true},
    }),
    prisma.sponsoredImpression.findMany({
      where: {campaign: {placeId: query.placeId}, createdAt: {gte: start}},
      select: {clicked: true, createdAt: true},
    }),
  ]);
  const statusCounts = Object.values(ReservationStatus).reduce<Record<string, number>>((acc, status) => ({...acc, [status]: 0}), {});
  const dailyMap = new Map<string, {reservations: number; guests: number}>();
  const hourMap = new Map<string, number>();
  const weekdayMap = new Map<string, {reservations: number; guests: number}>();
  let honoredGuests = 0;
  rows.forEach(row => {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    const day = row.reservationDate.toISOString().slice(0, 10);
    const daily = dailyMap.get(day) ?? {reservations: 0, guests: 0};
    daily.reservations += 1;
    if (row.status === ReservationStatus.CONFIRMED || row.status === ReservationStatus.COMPLETED) {
      daily.guests += row.numberOfPersons;
      honoredGuests += row.numberOfPersons;
      const hour = row.reservationTime.slice(0, 5);
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + row.numberOfPersons);
    }
    dailyMap.set(day, daily);
    const weekday = new Intl.DateTimeFormat('fr-FR', {weekday: 'long', timeZone: 'UTC'}).format(row.reservationDate);
    const weekdayValue = weekdayMap.get(weekday) ?? {reservations: 0, guests: 0};
    weekdayValue.reservations += 1;
    if (row.status === ReservationStatus.CONFIRMED || row.status === ReservationStatus.COMPLETED) weekdayValue.guests += row.numberOfPersons;
    weekdayMap.set(weekday, weekdayValue);
  });
  const cancelled = (statusCounts.CANCELLED ?? 0) + (statusCounts.DECLINED ?? 0);
  const total = rows.length;
  const completed = statusCounts.COMPLETED ?? 0;
  const uniqueCustomers = new Set(rows.map(row => row.userId)).size;
  const returningCustomers = [...new Set(rows.map(row => row.userId))].filter(userId => rows.filter(row => row.userId === userId).length > 1).length;
  const feedCount = (type: FeedEventType) => feedEvents.filter(event => event.type === type).length;
  const feedImpressions = feedCount(FeedEventType.FEED_IMPRESSION);
  const videoStarts = feedCount(FeedEventType.VIDEO_START);
  const videoCompletions = feedCount(FeedEventType.VIDEO_COMPLETE);
  const placeOpens = feedCount(FeedEventType.PLACE_OPEN);
  const totalWatchMs = feedEvents.reduce((sum, event) => sum + (event.watchMs ?? 0), 0);
  const sponsoredClicks = sponsoredImpressions.filter(value => value.clicked).length;
  return res.json({
    periodDays: query.days,
    from: start.toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    totals: {
      reservations: total,
      guests: honoredGuests,
      completed,
      noShow: statusCounts.NO_SHOW ?? 0,
      cancellationRate: total ? Math.round((cancelled / total) * 1000) / 10 : 0,
      completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
      uniqueCustomers,
      returningCustomers,
      averagePartySize: total ? Math.round((rows.reduce((sum, row) => sum + row.numberOfPersons, 0) / total) * 10) / 10 : 0,
    },
    byStatus: statusCounts,
    daily: [...dailyMap.entries()].map(([date, value]) => ({date, ...value})),
    peakHours: [...hourMap.entries()].map(([time, guests]) => ({time, guests})).sort((a, b) => b.guests - a.guests).slice(0, 5),
    weekdays: [...weekdayMap.entries()].map(([day, value]) => ({day, ...value})).sort((a, b) => b.guests - a.guests),
    feed: {
      impressions: feedImpressions,
      uniqueViewers: new Set(feedEvents.map(event => event.userId).filter(Boolean)).size,
      videoStarts,
      videoCompletions,
      completionRate: videoStarts ? Math.round((videoCompletions / videoStarts) * 1000) / 10 : 0,
      averageWatchSeconds: videoStarts ? Math.round((totalWatchMs / videoStarts / 1000) * 10) / 10 : 0,
      placeOpens,
      profileOpenRate: feedImpressions ? Math.round((placeOpens / feedImpressions) * 1000) / 10 : 0,
      favorites: feedCount(FeedEventType.FAVORITE_ADD),
      shares: feedCount(FeedEventType.SHARE),
      sponsoredImpressions: sponsoredImpressions.length,
      sponsoredClicks,
      sponsoredCtr: sponsoredImpressions.length ? Math.round((sponsoredClicks / sponsoredImpressions.length) * 1000) / 10 : 0,
    },
  });
}));

app.get('/pro/reservations', asyncRoute(async (req, res) => {
  const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const query = z.object({placeId: z.coerce.number().int().positive(), status: z.nativeEnum(ReservationStatus).optional(), date: dateValue.optional(), from: dateValue.optional(), to: dateValue.optional()}).parse(req.query);
  if (!(await ensurePlaceAccess(req, res, query.placeId))) return;
  await markLateReservationsAsNoShow(prisma, query.placeId);
  const rows = await prisma.reservation.findMany({where: {placeId: query.placeId, ...(query.status ? {status: query.status} : {}), ...(query.date ? {reservationDate: dateOnly(query.date)} : query.from || query.to ? {reservationDate: {...(query.from ? {gte: dateOnly(query.from)} : {}), ...(query.to ? {lte: dateOnly(query.to)} : {})}} : {})}, include: {place: true, user: true}, orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}]});
  const userIds = [...new Set(rows.map(row => row.userId))];
  const histories = userIds.length ? await prisma.reservation.groupBy({by: ['userId', 'status'], where: {placeId: query.placeId, userId: {in: userIds}}, _count: {_all: true}}) : [];
  const historyMap = new Map<number, {total: number; completed: number; noShow: number; cancelled: number}>();
  histories.forEach(value => {
    const current = historyMap.get(value.userId) ?? {total: 0, completed: 0, noShow: 0, cancelled: 0};
    current.total += value._count._all;
    if (value.status === ReservationStatus.COMPLETED) current.completed += value._count._all;
    if (value.status === ReservationStatus.NO_SHOW) current.noShow += value._count._all;
    if (value.status === ReservationStatus.CANCELLED || value.status === ReservationStatus.DECLINED) current.cancelled += value._count._all;
    historyMap.set(value.userId, current);
  });
  return res.json(rows.map(row => {
    const history = historyMap.get(row.userId) ?? {total: 0, completed: 0, noShow: 0, cancelled: 0};
    const noShowRate = history.total ? Math.round((history.noShow / history.total) * 100) : 0;
    const riskLevel = history.noShow >= 2 || noShowRate >= 35 ? 'HIGH' : history.noShow >= 1 || noShowRate >= 15 ? 'MEDIUM' : 'LOW';
    return {...reservationDto(row), customerName: `${row.user.firstName} ${row.user.lastName}`.trim(), customerMobile: row.user.mobile, customerEmail: row.user.email, customerHistory: {...history, noShowRate, riskLevel}};
  }));
}));

app.get('/pro/audit-logs', asyncRoute(async (req, res) => {
  const query = z.object({placeId: z.coerce.number().int().positive(), limit: z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query);
  if (!(await ensurePlaceAccess(req, res, query.placeId))) return;
  const logs = await prisma.auditLog.findMany({where: {placeId: query.placeId}, include: {actor: {select: {firstName: true, lastName: true, role: true}}}, orderBy: {createdAt: 'desc'}, take: query.limit});
  return res.json(logs.map(log => ({id: log.id, action: log.action, entityType: log.entityType, entityId: log.entityId, details: log.details, createdAt: log.createdAt, actorName: `${log.actor.firstName} ${log.actor.lastName}`.trim(), actorRole: log.actor.role})));
}));

app.post('/pro/tickets/scan', asyncRoute(async (req, res) => {
  const value = z.object({value: z.string().trim().min(20).max(3000)}).parse(req.body).value;
  const token = value.includes('/tickets/') ? value.split('/tickets/').pop()! : value;
  let ticket: {reservationId: number; userId: number};
  try {
    ticket = verifyReservationTicket(token);
  } catch {
    return res.status(400).json({message: 'QR code invalide ou expiré'});
  }
  const existing = await prisma.reservation.findFirst({where: {id: ticket.reservationId, userId: ticket.userId}, include: {place: true, user: true}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (!(await ensureScannerAccess(req, res, existing.placeId))) return;
  if (existing.status === ReservationStatus.COMPLETED) return res.json({...reservationDto(existing), customerName: `${existing.user.firstName} ${existing.user.lastName}`.trim(), alreadyScanned: true});
  if (existing.status === ReservationStatus.NO_SHOW) return res.status(409).json({message: 'Cette réservation est déjà marquée comme absence'});
  if (existing.status !== ReservationStatus.CONFIRMED) return res.status(409).json({message: 'Seule une réservation confirmée peut être validée'});
  const scannedAt = new Date();
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.COMPLETED, checkedInAt: scannedAt, completedAt: scannedAt}});
  await awardLoyaltyPoints(row);
  await audit(req, row.placeId, 'RESERVATION_CHECKED_IN', 'RESERVATION', row.id, {previousStatus: existing.status, nextStatus: row.status});
  await notify(row.userId, 'Présence validée', `Votre présence chez ${existing.place.name} a été validée par QR code.`);
  return res.json({...reservationDto({...row, place: existing.place}), customerName: `${existing.user.firstName} ${existing.user.lastName}`.trim(), alreadyScanned: false});
}));

app.patch('/pro/reservations/:reservationId/status', asyncRoute(async (req, res) => {
  const nextStatus = z.enum(['CONFIRMED', 'DECLINED', 'COMPLETED', 'NO_SHOW']).parse(req.body.status) as ReservationStatus;
  const existing = await prisma.reservation.findUnique({where: {id: id(req.params.reservationId)}, include: {place: true}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (!(await ensurePlaceAccess(req, res, existing.placeId))) return;
  const transitions: Partial<Record<ReservationStatus, ReservationStatus[]>> = {PENDING: [ReservationStatus.CONFIRMED, ReservationStatus.DECLINED], PROPOSED: [ReservationStatus.DECLINED], CONFIRMED: [ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW]};
  if (!transitions[existing.status]?.includes(nextStatus)) return res.status(409).json({message: 'Transition de statut non autorisée'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: nextStatus, proposedDate: null, proposedTime: null, proposalMessage: null}});
  if (nextStatus === ReservationStatus.COMPLETED) await awardLoyaltyPoints(row);
  await audit(req, row.placeId, 'RESERVATION_STATUS_CHANGED', 'RESERVATION', row.id, {previousStatus: existing.status, nextStatus});
  const labels: Record<string, string> = {CONFIRMED: 'confirmée', DECLINED: 'refusée', COMPLETED: 'terminée', NO_SHOW: 'marquée comme absence'};
  await notify(row.userId, 'Mise à jour de réservation', `Votre réservation chez ${existing.place.name} a été ${labels[nextStatus]}.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

app.patch('/pro/reservations/:reservationId/propose', asyncRoute(async (req, res) => {
  const body = z.object({date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), message: z.string().trim().max(500).optional()}).parse(req.body);
  const existing = await prisma.reservation.findUnique({where: {id: id(req.params.reservationId)}, include: {place: true}});
  if (!existing || existing.status !== ReservationStatus.PENDING) return res.status(409).json({message: 'Cette réservation ne peut pas recevoir de proposition'});
  if (!(await ensurePlaceAccess(req, res, existing.placeId))) return;
  const availability = await getAvailability(prisma, existing.placeId, body.date, existing.numberOfPersons, existing.id);
  const slot = availability?.slots.find((item: any) => item.time === body.time);
  if (!slot?.available) return res.status(409).json({message: 'Le créneau proposé n’est pas disponible'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.PROPOSED, proposedDate: dateOnly(body.date), proposedTime: body.time, proposalMessage: body.message}});
  await audit(req, row.placeId, 'RESERVATION_TIME_PROPOSED', 'RESERVATION', row.id, {date: body.date, time: body.time});
  await notify(row.userId, 'Nouvel horaire proposé', `${existing.place.name} vous propose le ${body.date} à ${body.time}.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

// Compatibilité avec les anciennes versions mobiles : aucune suppression physique.
app.delete('/deleteReservation/:reservationId', asyncRoute(async (req, res) => {
  const existing = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (!cancellableStatuses.includes(existing.status)) return res.status(409).json({message: 'Cette réservation ne peut plus être annulée'});
  await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.CANCELLED}});
  await notify(authId(req), 'Réservation annulée', 'Votre réservation a été annulée.');
  return res.status(204).send();
}));

app.get('/admin/reservations', asyncRoute(async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const status = z.nativeEnum(ReservationStatus).optional().parse(req.query.status);
  const actionable = req.query.actionable === 'true';
  const where = status ? {status} : actionable ? {status: {in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]}} : undefined;
  const rows = await prisma.reservation.findMany({where, include: {place: true, user: true}, orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}]});
  return res.json(rows.map(row => ({...reservationDto(row), customerName: `${row.user.firstName} ${row.user.lastName}`.trim(), customerMobile: row.user.mobile})));
}));

app.patch('/admin/reservations/:reservationId/status', asyncRoute(async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const nextStatus = z.enum(['CONFIRMED', 'DECLINED', 'COMPLETED', 'NO_SHOW']).parse(req.body.status) as ReservationStatus;
  const existing = await prisma.reservation.findUnique({where: {id: id(req.params.reservationId)}, include: {place: true}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  const transitions: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
    PENDING: [ReservationStatus.CONFIRMED, ReservationStatus.DECLINED],
    CONFIRMED: [ReservationStatus.COMPLETED, ReservationStatus.NO_SHOW],
  };
  if (!transitions[existing.status]?.includes(nextStatus)) return res.status(409).json({message: 'Transition de statut non autorisée'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: nextStatus}});
  if (nextStatus === ReservationStatus.COMPLETED) await awardLoyaltyPoints(row);
  const labels: Record<string, string> = {CONFIRMED: 'confirmée', DECLINED: 'refusée', COMPLETED: 'terminée', NO_SHOW: 'marquée comme absence'};
  await notify(row.userId, 'Mise à jour de réservation', `Votre réservation chez ${existing.place.name} a été ${labels[nextStatus]}.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

const rating = z.coerce.number().int().min(1).max(5);
app.post('/reviews', asyncRoute(async (req, res) => {
  const reviewPhoto = z.string().max(2_000_000).refine(value => /^https?:\/\//.test(value) || /^data:image\/(jpeg|png|webp);base64,/.test(value), 'Photo invalide');
  const body = z.object({reservationId: z.coerce.number().int().positive(), cuisineRating: rating, serviceRating: rating, ambianceRating: rating, priceRating: rating, comment: z.string().trim().max(2000).optional(), photos: z.array(reviewPhoto).max(3).default([])}).parse(req.body);
  const reservation = await prisma.reservation.findFirst({where: {id: body.reservationId, userId: authId(req)}, include: {review: true, place: {select: {reviewsEnabled: true}}}});
  if (!reservation) return res.status(404).json({message: 'Réservation introuvable'});
  if (!reservation.place.reviewsEnabled) return res.status(409).json({message: 'Cet établissement ne participe pas actuellement aux avis vérifiés'});
  if (reservation.status !== ReservationStatus.COMPLETED) return res.status(409).json({message: 'Un avis est possible uniquement après une réservation terminée'});
  if (reservation.review) return res.status(409).json({message: 'Vous avez déjà publié un avis pour cette réservation'});
  const review = await prisma.review.create({data: {...body, userId: authId(req), placeId: reservation.placeId}});
  return res.status(201).json(review);
}));

app.get('/pro/reviews', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const rows = await prisma.review.findMany({where: {placeId}, include: {user: true}, orderBy: {createdAt: 'desc'}});
  return res.json(rows.map(row => ({...row, customerName: `${row.user.firstName} ${row.user.lastName}`.trim(), averageRating: Math.round(((row.cuisineRating + row.serviceRating + row.ambianceRating + row.priceRating) / 4) * 10) / 10})));
}));

app.get('/pro/reviews/settings', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  const place = await prisma.place.findUnique({where: {id: placeId}, select: {reviewsEnabled: true}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  return res.json(place);
}));

app.put('/pro/reviews/settings', asyncRoute(async (req, res) => {
  const body = z.object({placeId: z.coerce.number().int().positive(), enabled: z.boolean()}).parse(req.body);
  if (!(await ensurePlaceAccess(req, res, body.placeId))) return;
  const place = await prisma.place.update({where: {id: body.placeId}, data: {reviewsEnabled: body.enabled}, select: {reviewsEnabled: true}});
  await audit(req, body.placeId, body.enabled ? 'REVIEWS_ENABLED' : 'REVIEWS_DISABLED', 'PLACE', body.placeId);
  return res.json(place);
}));

app.patch('/pro/reviews/:reviewId/respond', asyncRoute(async (req, res) => {
  const reviewId = id(req.params.reviewId);
  const existing = await prisma.review.findUnique({where: {id: reviewId}});
  if (!existing) return res.status(404).json({message: 'Avis introuvable'});
  if (!(await ensurePlaceAccess(req, res, existing.placeId))) return;
  const {response} = z.object({response: z.string().trim().min(2).max(2000)}).parse(req.body);
  const review = await prisma.review.update({where: {id: reviewId}, data: {establishmentResponse: response, respondedAt: new Date()}});
  await notify(review.userId, 'Réponse à votre avis', 'L’établissement a répondu à votre avis.');
  await audit(req, review.placeId, 'REVIEW_RESPONDED', 'REVIEW', review.id);
  return res.json(review);
}));

app.patch('/admin/reviews/:reviewId/respond', asyncRoute(async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const {response} = z.object({response: z.string().trim().min(2).max(2000)}).parse(req.body);
  const review = await prisma.review.update({where: {id: id(req.params.reviewId)}, data: {establishmentResponse: response, respondedAt: new Date()}});
  await notify(review.userId, 'Réponse à votre avis', 'L’établissement a répondu à votre avis.');
  return res.json(review);
}));

const waitlistSchema = z.object({placeId: z.coerce.number().int().positive(), reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reservationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), numberOfPersons: z.coerce.number().int().min(1).max(20)});
app.post('/waitlist', asyncRoute(async (req, res) => {
  const body = waitlistSchema.parse(req.body);
  if (reservationMoment(body.reservationDate, body.reservationTime).getTime() <= Date.now()) return res.status(400).json({message: 'Le créneau doit être dans le futur'});
  const availability = await getAvailability(prisma, body.placeId, body.reservationDate, body.numberOfPersons);
  if (!availability) return res.status(404).json({message: 'Établissement introuvable'});
  const slot = availability.slots.find((item: any) => item.time === body.reservationTime.slice(0, 5));
  if (!slot) return res.status(409).json({message: 'L’établissement est fermé à cette heure'});
  if (slot.available) return res.status(409).json({message: 'Ce créneau est encore disponible, vous pouvez réserver directement'});
  if (slot.status !== 'FULL') return res.status(409).json({message: 'Ce créneau ne permet pas de rejoindre la liste d’attente'});
  const entry = await prisma.waitlistEntry.upsert({where: {userId_placeId_reservationDate_reservationTime: {userId: authId(req), placeId: body.placeId, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime}}, update: {numberOfPersons: body.numberOfPersons, status: WaitlistStatus.WAITING, offerExpiresAt: null}, create: {...body, userId: authId(req), reservationDate: dateOnly(body.reservationDate)}});
  await notify(authId(req), 'Liste d’attente', 'Vous avez rejoint la liste d’attente. Nous vous préviendrons si une place se libère.');
  return res.status(201).json(entry);
}));

app.get('/waitlist/mine', asyncRoute(async (req, res) => {
  await prisma.waitlistEntry.updateMany({where: {userId: authId(req), status: WaitlistStatus.OFFERED, offerExpiresAt: {lt: new Date()}}, data: {status: WaitlistStatus.EXPIRED}});
  return res.json(await prisma.waitlistEntry.findMany({where: {userId: authId(req)}, include: {place: true}, orderBy: {createdAt: 'desc'}}));
}));

app.patch('/waitlist/:entryId/cancel', asyncRoute(async (req, res) => {
  const result = await prisma.waitlistEntry.updateMany({where: {id: id(req.params.entryId), userId: authId(req), status: {in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED]}}, data: {status: WaitlistStatus.CANCELLED, offerExpiresAt: null}});
  if (!result.count) return res.status(409).json({message: 'Cette entrée ne peut plus être annulée'});
  return res.status(204).send();
}));

app.get('/pro/waitlist', asyncRoute(async (req, res) => {
  const placeId = id(req.query.placeId);
  if (!(await ensurePlaceAccess(req, res, placeId))) return;
  await prisma.waitlistEntry.updateMany({where: {placeId, status: WaitlistStatus.OFFERED, offerExpiresAt: {lt: new Date()}}, data: {status: WaitlistStatus.EXPIRED}});
  const rows = await prisma.waitlistEntry.findMany({where: {placeId}, include: {user: true}, orderBy: [{reservationDate: 'asc'}, {reservationTime: 'asc'}, {createdAt: 'asc'}]});
  return res.json(rows.map(row => ({...row, reservationDate: row.reservationDate.toISOString().slice(0, 10), customerName: `${row.user.firstName} ${row.user.lastName}`.trim(), customerMobile: row.user.mobile, customerEmail: row.user.email})));
}));

app.patch('/pro/waitlist/:entryId/offer', asyncRoute(async (req, res) => {
  const entryId = id(req.params.entryId);
  const existing = await prisma.waitlistEntry.findUnique({where: {id: entryId}, include: {place: true}});
  if (!existing) return res.status(404).json({message: 'Demande introuvable'});
  if (!(await ensurePlaceAccess(req, res, existing.placeId))) return;
  if (existing.status !== WaitlistStatus.WAITING) return res.status(409).json({message: 'Cette demande n’est plus en attente'});
  const minutes = z.coerce.number().int().min(5).max(60).default(15).parse(req.body.minutes);
  const expires = new Date(Date.now() + minutes * 60_000);
  const entry = await prisma.waitlistEntry.update({where: {id: entryId}, data: {status: WaitlistStatus.OFFERED, offerExpiresAt: expires}});
  await notify(entry.userId, 'Une table est disponible', `Une place chez ${existing.place.name} vous est réservée pendant ${minutes} minutes.`);
  await audit(req, entry.placeId, 'WAITLIST_OFFERED', 'WAITLIST', entry.id, {minutes});
  return res.json(entry);
}));

app.patch('/admin/waitlist/:entryId/offer', asyncRoute(async (req, res) => {
  if (!(await ensureAdmin(req, res))) return;
  const minutes = z.coerce.number().int().min(5).max(60).default(15).parse(req.body.minutes);
  const expires = new Date(Date.now() + minutes * 60_000);
  const entry = await prisma.waitlistEntry.update({where: {id: id(req.params.entryId)}, data: {status: WaitlistStatus.OFFERED, offerExpiresAt: expires}, include: {place: true}});
  await notify(entry.userId, 'Une table est disponible', `Une place chez ${entry.place.name} vous est réservée pendant ${minutes} minutes.`);
  return res.json(entry);
}));

app.post('/waitlist/:entryId/confirm', asyncRoute(async (req, res) => {
  const entry = await prisma.waitlistEntry.findFirst({where: {id: id(req.params.entryId), userId: authId(req)}, include: {place: true}});
  if (!entry || entry.status !== WaitlistStatus.OFFERED) return res.status(409).json({message: 'Aucune offre active'});
  if (!entry.offerExpiresAt || entry.offerExpiresAt <= new Date()) {
    await prisma.waitlistEntry.update({where: {id: entry.id}, data: {status: WaitlistStatus.EXPIRED}});
    return res.status(410).json({message: 'Cette offre a expiré'});
  }
  const reservation = await prisma.$transaction(async tx => {
    const day = entry.reservationDate.toISOString().slice(0, 10);
    const availability = await getAvailability(tx, entry.placeId, day, entry.numberOfPersons);
    const slot = availability?.slots.find((item: any) => item.time === entry.reservationTime.slice(0, 5));
    if (!slot?.available) throw Object.assign(new Error('La table proposée n’est plus disponible'), {statusCode: 409});
    const created = await tx.reservation.create({data: {userId: entry.userId, placeId: entry.placeId, reservationDate: entry.reservationDate, reservationTime: entry.reservationTime, numberOfPersons: entry.numberOfPersons, status: ReservationStatus.CONFIRMED}});
    await tx.waitlistEntry.update({where: {id: entry.id}, data: {status: WaitlistStatus.CONFIRMED}});
    await tx.notification.create({data: {userId: entry.userId, title: 'Table confirmée', message: `Votre table chez ${entry.place.name} est confirmée.`}});
    return created;
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
  return res.status(201).json(reservationDto({...reservation, place: entry.place}));
}));

const groupOptionSchema = z.object({placeId: z.coerce.number().int().positive(), reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reservationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)});
app.post('/group-plans', asyncRoute(async (req, res) => {
  const body = z.object({title: z.string().trim().min(2).max(120), inviteEmails: z.array(z.string().email().transform(v => v.toLowerCase())).max(30).default([]), votingEndsAt: z.string().datetime().optional(), options: z.array(groupOptionSchema).min(2).max(8)}).parse(req.body);
  const plan = await prisma.groupPlan.create({data: {organizerId: authId(req), title: body.title, inviteEmails: [...new Set(body.inviteEmails)], votingEndsAt: body.votingEndsAt ? new Date(body.votingEndsAt) : undefined, options: {create: body.options.map(option => ({...option, reservationDate: dateOnly(option.reservationDate)}))}}, include: {options: {include: {place: true, votes: true}}}});
  return res.status(201).json(plan);
}));

app.get('/group-plans', asyncRoute(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({where: {id: authId(req)}, select: {email: true}});
  return res.json(await prisma.groupPlan.findMany({where: {OR: [{organizerId: authId(req)}, {inviteEmails: {has: user.email}}]}, include: {options: {include: {place: true, votes: true}}}, orderBy: {createdAt: 'desc'}}));
}));

app.post('/group-options/:optionId/vote', asyncRoute(async (req, res) => {
  const option = await prisma.groupOption.findUnique({where: {id: id(req.params.optionId)}, include: {plan: true}});
  if (!option || option.plan.status !== GroupPlanStatus.VOTING) return res.status(409).json({message: 'Le vote est fermé'});
  const user = await prisma.user.findUniqueOrThrow({where: {id: authId(req)}, select: {email: true}});
  if (option.plan.organizerId !== authId(req) && !option.plan.inviteEmails.includes(user.email)) return res.status(403).json({message: 'Vous n’êtes pas invité à ce plan'});
  const userId = authId(req);
  const voted = await prisma.$transaction(async tx => {
    const existing = await tx.groupVote.findUnique({where: {optionId_userId: {optionId: option.id, userId}}});
    if (existing) {
      await tx.groupVote.delete({where: {id: existing.id}});
      return false;
    }
    await tx.groupVote.create({data: {optionId: option.id, userId}});
    return true;
  });
  return res.json({voted});
}));

app.post('/group-plans/:planId/finalize', asyncRoute(async (req, res) => {
  const plan = await prisma.groupPlan.findFirst({where: {id: id(req.params.planId), organizerId: authId(req), status: GroupPlanStatus.VOTING}, include: {options: {include: {_count: {select: {votes: true}}}}}});
  if (!plan) return res.status(404).json({message: 'Plan de groupe introuvable'});
  const winner = [...plan.options].sort((a, b) => b._count.votes - a._count.votes)[0];
  if (!winner) return res.status(409).json({message: 'Aucune option disponible'});
  const updated = await prisma.groupPlan.update({where: {id: plan.id}, data: {status: GroupPlanStatus.FINALIZED, selectedOptionId: winner.id}});
  return res.json({...updated, selectedOption: winner});
}));

app.post('/addReport', asyncRoute(async (req, res) => {
  const body = z.object({reportedId: z.coerce.number().int().positive(), note: z.string().trim().min(3).max(2000)}).parse(req.body);
  const report = await prisma.report.create({data: {userId: authId(req), placeId: body.reportedId, description: body.note}});
  return res.status(201).json(report);
}));

app.get('/notifications', asyncRoute(async (req, res) => {
  return res.json(await prisma.notification.findMany({where: {userId: authId(req)}, orderBy: {createdAt: 'desc'}}));
}));

app.get('/notifications/unread-count', asyncRoute(async (req, res) => {
  return res.json({count: await prisma.notification.count({where: {userId: authId(req), read: false}})});
}));

app.patch('/notifications/read-all', asyncRoute(async (req, res) => {
  const result = await prisma.notification.updateMany({where: {userId: authId(req), read: false}, data: {read: true}});
  return res.json({updated: result.count});
}));

app.patch('/notifications/:notificationId/read', asyncRoute(async (req, res) => {
  const result = await prisma.notification.updateMany({where: {id: id(req.params.notificationId), userId: authId(req)}, data: {read: true}});
  if (!result.count) return res.status(404).json({message: 'Notification introuvable'});
  return res.status(204).send();
}));

app.use((_req, res) => res.status(404).json({message: 'Route introuvable'}));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({message: 'Données invalides', errors: error.flatten()});
  if (error instanceof Error && 'statusCode' in error && typeof (error as any).statusCode === 'number') {
    return res.status((error as any).statusCode).json({message: error.message});
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return res.status(409).json({message: 'Cette valeur existe déjà'});
    if (error.code === 'P2025') return res.status(404).json({message: 'Ressource introuvable'});
    if (error.code === 'P2003') return res.status(400).json({message: 'Référence invalide'});
    if (error.code === 'P2034') return res.status(409).json({message: 'Ce créneau vient d’être réservé. Choisissez-en un autre.'});
  }
  console.error(error);
  return res.status(500).json({message: 'Erreur interne du serveur'});
});
