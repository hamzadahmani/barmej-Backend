import express, {NextFunction, Request, Response} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import {z, ZodError} from 'zod';
import {GroupPlanStatus, Prisma, ReservationStatus, UserRole, WaitlistStatus} from '@prisma/client';
import {config} from './config';
import {prisma} from './db';
import {AuthRequest, requireAuth, signReservationTicket, signToken, verifyReservationTicket} from './auth';
import {placeDto, placeInfoDto, userDto} from './mappers';

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
  return res.json({status: 'ok'});
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
  const rows = await prisma.place.findMany({where: {categoryId: id(req.params.categoryId)}, orderBy: {name: 'asc'}});
  return res.json(rows.map(placeDto));
}));

app.get('/getPlaceInfoByIdPlace/:placeId', asyncRoute(async (req, res) => {
  const place = await prisma.place.findUnique({where: {id: id(req.params.placeId)}});
  if (!place) return res.status(404).json({message: 'Lieu introuvable'});
  return res.json({place: placeDto(place), placeinfo: placeInfoDto(place)});
}));

app.get('/getFeaturedPlaces', asyncRoute(async (_req, res) => {
  const rows = await prisma.place.findMany({
    orderBy: [{updatedAt: 'desc'}, {name: 'asc'}],
    take: 12,
  });
  return res.json(rows.map(placeDto));
}));

app.get('/search', asyncRoute(async (req, res) => {
  const query = z.string().trim().max(100).default('').parse(req.query.query);
  if (!query) return res.json([]);
  const rows = await prisma.place.findMany({where: {OR: [
    {name: {contains: query, mode: 'insensitive'}},
    {subtitle: {contains: query, mode: 'insensitive'}},
    {address: {contains: query, mode: 'insensitive'}},
  ]}, take: 30});
  return res.json(rows.map(placeDto));
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
  const rows = await prisma.review.findMany({
    where: {placeId: id(req.params.placeId)},
    include: {user: {select: {firstName: true, lastName: true}}},
    orderBy: {createdAt: 'desc'},
  });
  const average = rows.length ? rows.reduce((sum, row) => sum + (row.cuisineRating + row.serviceRating + row.ambianceRating + row.priceRating) / 4, 0) / rows.length : null;
  return res.json({average, count: rows.length, reviews: rows.map(row => ({...row, userName: `${row.user.firstName} ${row.user.lastName.charAt(0)}.`.trim()}))});
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
  const body = z.object({firstName: z.string().optional(), lastName: z.string().optional(), userMobile: z.string().nullable().optional(), userGender: z.string().nullable().optional(), userPhoto: z.string().nullable().optional(), dateOfBirth: z.string().optional()}).passthrough().parse(req.body);
  const user = await prisma.user.update({where: {id: authId(req)}, data: {firstName: body.firstName, lastName: body.lastName, mobile: body.userMobile, gender: body.userGender, photo: body.userPhoto, birthDate: body.dateOfBirth ? dateOnly(body.dateOfBirth) : undefined}});
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
});
const validateFutureReservation = (body: z.infer<typeof reservationBaseSchema>, ctx: z.RefinementCtx) => {
  if (reservationMoment(body.reservationDate, body.reservationTime).getTime() <= Date.now()) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['reservationTime'], message: 'Choisissez une date et une heure futures'});
  }
};
const reservationSchema = reservationBaseSchema.superRefine(validateFutureReservation);
const cancellableStatuses: ReservationStatus[] = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];
const reservationDto = (r: any) => ({idReservation: r.id, idUser: r.userId, idPlace: r.placeId, reservationDate: r.reservationDate.toISOString().slice(0, 10), reservationTime: r.reservationTime, numberOfPersons: r.numberOfPersons, message: r.message, status: r.status, hasReview: Boolean(r.review), ticketToken: signReservationTicket(r.id, r.userId), ...(r.place ? {...placeDto(r.place), placeAddress: r.place.address} : {})});

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
      status: {in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]},
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
    const created = await tx.reservation.create({data: {userId: authId(req), placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message}});
    await tx.notification.create({data: {userId: authId(req), title: 'Demande envoyée', message: `Votre réservation du ${body.reservationDate} à ${body.reservationTime} est en attente.`}});
    return tx.reservation.findUniqueOrThrow({where: {id: created.id}, include: {place: true}});
  });
  return res.status(201).json(reservationDto(row));
}));

app.put('/updateReservation', asyncRoute(async (req, res) => {
  const body = reservationBaseSchema.extend({idReservation: z.coerce.number().int().positive()}).superRefine(validateFutureReservation).parse(req.body);
  const existing = await prisma.reservation.findFirst({where: {id: body.idReservation, userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (existing.status !== ReservationStatus.PENDING) return res.status(409).json({message: 'Seule une réservation en attente peut être modifiée'});
  const row = await prisma.$transaction(async tx => {
    const updated = await tx.reservation.update({where: {id: existing.id}, data: {placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message}});
    await tx.notification.create({data: {userId: authId(req), title: 'Réservation modifiée', message: `Votre demande est maintenant prévue le ${body.reservationDate} à ${body.reservationTime}.`}});
    return updated;
  });
  return res.json(reservationDto(row));
}));

app.patch('/reservations/:reservationId/cancel', asyncRoute(async (req, res) => {
  const existing = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  if (!cancellableStatuses.includes(existing.status)) return res.status(409).json({message: 'Cette réservation ne peut plus être annulée'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {status: ReservationStatus.CANCELLED}});
  await notify(authId(req), 'Réservation annulée', `Votre réservation du ${row.reservationDate.toISOString().slice(0, 10)} à ${row.reservationTime} a été annulée.`);
  return res.json(reservationDto(row));
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
  const labels: Record<string, string> = {CONFIRMED: 'confirmée', DECLINED: 'refusée', COMPLETED: 'terminée', NO_SHOW: 'marquée comme absence'};
  await notify(row.userId, 'Mise à jour de réservation', `Votre réservation chez ${existing.place.name} a été ${labels[nextStatus]}.`);
  return res.json(reservationDto({...row, place: existing.place}));
}));

const rating = z.coerce.number().int().min(1).max(5);
app.post('/reviews', asyncRoute(async (req, res) => {
  const reviewPhoto = z.string().max(2_000_000).refine(value => /^https?:\/\//.test(value) || /^data:image\/(jpeg|png|webp);base64,/.test(value), 'Photo invalide');
  const body = z.object({reservationId: z.coerce.number().int().positive(), cuisineRating: rating, serviceRating: rating, ambianceRating: rating, priceRating: rating, comment: z.string().trim().max(2000).optional(), photos: z.array(reviewPhoto).max(3).default([])}).parse(req.body);
  const reservation = await prisma.reservation.findFirst({where: {id: body.reservationId, userId: authId(req)}, include: {review: true}});
  if (!reservation) return res.status(404).json({message: 'Réservation introuvable'});
  if (reservation.status !== ReservationStatus.COMPLETED) return res.status(409).json({message: 'Un avis est possible uniquement après une réservation terminée'});
  if (reservation.review) return res.status(409).json({message: 'Vous avez déjà publié un avis pour cette réservation'});
  const review = await prisma.review.create({data: {...body, userId: authId(req), placeId: reservation.placeId}});
  return res.status(201).json(review);
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
  const place = await prisma.place.findUnique({where: {id: body.placeId}});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  const occupied = await prisma.reservation.aggregate({_sum: {numberOfPersons: true}, where: {placeId: body.placeId, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, status: {in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED]}}});
  if ((occupied._sum.numberOfPersons ?? 0) + body.numberOfPersons <= place.capacityPerSlot) return res.status(409).json({message: 'Ce créneau est encore disponible, vous pouvez réserver directement'});
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
    const created = await tx.reservation.create({data: {userId: entry.userId, placeId: entry.placeId, reservationDate: entry.reservationDate, reservationTime: entry.reservationTime, numberOfPersons: entry.numberOfPersons, status: ReservationStatus.CONFIRMED}});
    await tx.waitlistEntry.update({where: {id: entry.id}, data: {status: WaitlistStatus.CONFIRMED}});
    await tx.notification.create({data: {userId: entry.userId, title: 'Table confirmée', message: `Votre table chez ${entry.place.name} est confirmée.`}});
    return created;
  });
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
  await prisma.$transaction(async tx => {
    await tx.groupVote.deleteMany({where: {userId: authId(req), option: {planId: option.planId}}});
    await tx.groupVote.create({data: {optionId: option.id, userId: authId(req)}});
  });
  return res.status(204).send();
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

app.patch('/notifications/:notificationId/read', asyncRoute(async (req, res) => {
  const result = await prisma.notification.updateMany({where: {id: id(req.params.notificationId), userId: authId(req)}, data: {read: true}});
  if (!result.count) return res.status(404).json({message: 'Notification introuvable'});
  return res.status(204).send();
}));

app.use((_req, res) => res.status(404).json({message: 'Route introuvable'}));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({message: 'Données invalides', errors: error.flatten()});
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return res.status(409).json({message: 'Cette valeur existe déjà'});
    if (error.code === 'P2025') return res.status(404).json({message: 'Ressource introuvable'});
    if (error.code === 'P2003') return res.status(400).json({message: 'Référence invalide'});
  }
  console.error(error);
  return res.status(500).json({message: 'Erreur interne du serveur'});
});
