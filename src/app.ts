import express, {NextFunction, Request, Response} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import {z, ZodError} from 'zod';
import {Prisma} from '@prisma/client';
import {config} from './config';
import {prisma} from './db';
import {AuthRequest, requireAuth, signToken} from './auth';
import {placeDto, placeInfoDto, userDto} from './mappers';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',')}));
app.use(express.json({limit: '1mb'}));
if (config.NODE_ENV !== 'test') app.use(morgan('combined'));

const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const authId = (req: Request) => (req as AuthRequest).userId;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

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

const reservationSchema = z.object({idPlace: z.coerce.number().int().positive(), reservationDate: z.string(), reservationTime: z.string().min(4), numberOfPersons: z.coerce.number().int().positive().max(100), message: z.string().max(1000).optional().nullable()});
const reservationDto = (r: any) => ({idReservation: r.id, idUser: r.userId, idPlace: r.placeId, reservationDate: r.reservationDate.toISOString().slice(0, 10), reservationTime: r.reservationTime, numberOfPersons: r.numberOfPersons, message: r.message, status: r.status, ...(r.place ? {...placeDto(r.place), placeAddress: r.place.address} : {})});

app.get('/getAllReservationsByUser', asyncRoute(async (req, res) => {
  const rows = await prisma.reservation.findMany({where: {userId: authId(req)}, include: {place: true}, orderBy: [{reservationDate: 'desc'}, {reservationTime: 'desc'}]});
  return res.json(rows.map(reservationDto));
}));

app.get('/getReservationById/:reservationId', asyncRoute(async (req, res) => {
  const row = await prisma.reservation.findFirst({where: {id: id(req.params.reservationId), userId: authId(req)}, include: {place: true}});
  if (!row) return res.status(404).json({message: 'Réservation introuvable'});
  return res.json(reservationDto(row));
}));

app.post('/addReservation', asyncRoute(async (req, res) => {
  const body = reservationSchema.parse(req.body);
  const row = await prisma.reservation.create({data: {userId: authId(req), placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message}});
  return res.status(201).json(reservationDto(row));
}));

app.put('/updateReservation', asyncRoute(async (req, res) => {
  const body = reservationSchema.extend({idReservation: z.coerce.number().int().positive()}).parse(req.body);
  const existing = await prisma.reservation.findFirst({where: {id: body.idReservation, userId: authId(req)}});
  if (!existing) return res.status(404).json({message: 'Réservation introuvable'});
  const row = await prisma.reservation.update({where: {id: existing.id}, data: {placeId: body.idPlace, reservationDate: dateOnly(body.reservationDate), reservationTime: body.reservationTime, numberOfPersons: body.numberOfPersons, message: body.message}});
  return res.json(reservationDto(row));
}));

app.delete('/deleteReservation/:reservationId', asyncRoute(async (req, res) => {
  const result = await prisma.reservation.deleteMany({where: {id: id(req.params.reservationId), userId: authId(req)}});
  if (!result.count) return res.status(404).json({message: 'Réservation introuvable'});
  return res.status(204).send();
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
