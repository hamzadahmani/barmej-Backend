// API du backoffice Barmej : réservée aux comptes ADMIN, montée sous /admin/v1.
import {MediaModerationStatus, Prisma, ReservationStatus, SubscriptionPlan, SubscriptionStatus, UserRole, VenueEnvironment} from '@prisma/client';
import {NextFunction, Request, Response, Router} from 'express';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {AuthRequest, forgetSuspension} from './auth';
import {prisma} from './db';
import {containsProfanity} from './profanity';
import {SOURCE_LABELS, conversionRate, mergeDaily, percentChange, periodDays, videoThumbnail} from './audienceLogic';
import {subscriptionFeatures} from './subscriptions';

export const adminRouter = Router();
const route = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);
const actorId = (req: Request) => (req as AuthRequest).userId;
const positiveId = (value: unknown) => z.coerce.number().int().positive().parse(value);
const DAY = 86_400_000;

const pageQuery = z.object({page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(5).max(100).default(25)});
const paged = <T>(items: T[], total: number, page: number, pageSize: number) => ({items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize))});

// Toutes les routes : compte ADMIN obligatoire (requireAuth est appliqué avant le montage).
adminRouter.use((req, res, next) => {
  prisma.user.findUnique({where: {id: actorId(req)}, select: {role: true}})
    .then(user => (user?.role === UserRole.ADMIN ? next() : res.status(403).json({message: 'Accès réservé aux administrateurs Barmej'})))
    .catch(next);
});

const audit = (req: Request, placeId: number, action: string, entityType: string, entityId?: number, details?: Prisma.InputJsonValue) =>
  prisma.auditLog.create({data: {actorId: actorId(req), placeId, action, entityType, entityId, details}}).catch(() => undefined);

const userSummary = (u: any) => u ? {id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, mobile: u.mobile, role: u.role, suspendedAt: u.suspendedAt ?? null, suspendedReason: u.suspendedReason ?? null} : null;
const PRO_ROLES: UserRole[] = [UserRole.ESTABLISHMENT, UserRole.SCANNER];

/* ─────────── Tableau de bord ─────────── */
adminRouter.get('/me', route(async (req, res) => {
  const user = await prisma.user.findUnique({where: {id: actorId(req)}});
  return res.json(userSummary(user));
}));

adminRouter.get('/overview', route(async (_req, res) => {
  const now = new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const since = new Date(today.getTime() - 13 * DAY);
  const [users, newUsers, places, verifiedPlaces, pendingReservations, todayReservations, pendingStays, plans, subscriptionRequests, pendingMedia, reports, recentReservations, recentUsers, byPlan] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({where: {createdAt: {gte: weekAgo}}}),
    prisma.place.count(),
    prisma.place.count({where: {verified: true}}),
    prisma.reservation.count({where: {status: ReservationStatus.PENDING}}),
    prisma.reservation.count({where: {reservationDate: today}}),
    prisma.stayBooking.count({where: {status: {in: [ReservationStatus.PENDING, ReservationStatus.PROPOSED]}}}),
    prisma.barmejliPlan.count({where: {createdAt: {gte: weekAgo}}}),
    prisma.establishmentSubscription.count({where: {requestedPlan: {not: null}}}),
    prisma.placeMedia.count({where: {moderationStatus: MediaModerationStatus.PENDING}}),
    prisma.report.count({where: {createdAt: {gte: new Date(now.getTime() - 30 * DAY)}}}),
    prisma.reservation.findMany({where: {createdAt: {gte: since}}, select: {createdAt: true, status: true}}),
    prisma.user.findMany({where: {createdAt: {gte: since}}, select: {createdAt: true}}),
    prisma.establishmentSubscription.groupBy({by: ['plan'], _count: {_all: true}}),
  ]);
  const daily = Array.from({length: 14}, (_, i) => {
    const day = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    return {
      date: day,
      reservations: recentReservations.filter(r => r.createdAt.toISOString().slice(0, 10) === day).length,
      signups: recentUsers.filter(u => u.createdAt.toISOString().slice(0, 10) === day).length,
    };
  });
  return res.json({
    users, newUsers, places, verifiedPlaces, pendingReservations, todayReservations, pendingStays,
    barmejliPlans7d: plans, subscriptionRequests, pendingMedia, reports30d: reports, daily,
    plans: Object.fromEntries(byPlan.map(row => [row.plan, row._count._all])),
  });
}));

/* ─────────── Établissements ─────────── */
adminRouter.get('/categories', route(async (_req, res) => {
  const rows = await prisma.category.findMany({orderBy: {id: 'asc'}, include: {_count: {select: {places: true}}}});
  return res.json(rows.map(c => ({id: c.id, name: c.name, image: c.image, places: c._count.places})));
}));

const placeListItem = (p: any) => ({
  id: p.id, name: p.name, subtitle: p.subtitle, image: p.image, address: p.address, phone: p.phone,
  categoryId: p.categoryId, categoryName: p.category?.name, verified: p.verified, averagePrice: p.averagePrice,
  plan: p.subscription?.plan ?? SubscriptionPlan.DISCOVERY, requestedPlan: p.subscription?.requestedPlan ?? null,
  managers: p._count?.managers ?? 0, media: p._count?.media ?? 0, createdAt: p.createdAt,
});

adminRouter.get('/places', route(async (req, res) => {
  const q = pageQuery.extend({q: z.string().trim().optional(), categoryId: z.coerce.number().int().optional(), verified: z.enum(['true', 'false']).optional()}).parse(req.query);
  const where: Prisma.PlaceWhereInput = {
    ...(q.q ? {OR: [{name: {contains: q.q, mode: 'insensitive'}}, {address: {contains: q.q, mode: 'insensitive'}}]} : {}),
    ...(q.categoryId ? {categoryId: q.categoryId} : {}),
    ...(q.verified ? {verified: q.verified === 'true'} : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.place.findMany({where, include: {category: true, subscription: true, _count: {select: {managers: true, media: true}}}, orderBy: {name: 'asc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.place.count({where}),
  ]);
  return res.json(paged(rows.map(placeListItem), total, q.page, q.pageSize));
}));

const placeDetail = (p: any) => ({
  ...placeListItem(p),
  latitude: p.latitude, longitude: p.longitude, email: p.email, description: p.description, schedule: p.schedule,
  happyHour: p.happyHour, outfit: p.outfit, musicStyle: p.musicStyle, nightlyPrice: p.nightlyPrice, roomCount: p.roomCount,
  capacityPerSlot: p.capacityPerSlot, reviewsEnabled: p.reviewsEnabled, cuisineType: p.cuisineType,
  ambienceTags: p.ambienceTags, suitabilityMoods: p.suitabilityMoods, groupTypes: p.groupTypes,
  environment: p.environment, weatherSensitive: p.weatherSensitive, defaultDurationMin: p.defaultDurationMin,
  categoryIds: p.categories?.map((c: any) => c.categoryId) ?? [p.categoryId],
  subscription: p.subscription ? {plan: p.subscription.plan, status: p.subscription.status, requestedPlan: p.subscription.requestedPlan, requestedAt: p.subscription.requestedAt, endsAt: p.subscription.endsAt} : null,
  managersList: (p.managers ?? []).map((m: any) => userSummary(m.user)),
});

const placeInclude = {category: true, categories: true, subscription: true, managers: {include: {user: true}}, _count: {select: {managers: true, media: true}}} as const;

adminRouter.get('/places/:id', route(async (req, res) => {
  const place = await prisma.place.findUnique({where: {id: positiveId(req.params.id)}, include: placeInclude});
  if (!place) return res.status(404).json({message: 'Établissement introuvable'});
  return res.json(placeDetail(place));
}));

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => (v === '' ? null : v));
const placeBody = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.number().int().positive(),
  categoryIds: z.array(z.number().int().positive()).max(6).optional(),
  subtitle: nullableText(160), image: nullableText(500), address: nullableText(250), phone: nullableText(40), email: nullableText(160),
  description: nullableText(3000), schedule: nullableText(200), happyHour: nullableText(300), outfit: nullableText(120), musicStyle: nullableText(120),
  cuisineType: nullableText(120),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  averagePrice: z.number().int().min(0).max(100_000).nullable().optional(),
  nightlyPrice: z.number().int().min(0).max(100_000).nullable().optional(),
  roomCount: z.number().int().min(1).max(500).nullable().optional(),
  capacityPerSlot: z.number().int().min(1).max(2000).optional(),
  verified: z.boolean().optional(), reviewsEnabled: z.boolean().optional(),
  ambienceTags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  suitabilityMoods: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  groupTypes: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  environment: z.nativeEnum(VenueEnvironment).optional(),
  weatherSensitive: z.boolean().optional(),
  defaultDurationMin: z.number().int().min(15).max(600).optional(),
});

adminRouter.post('/places', route(async (req, res) => {
  const {categoryIds, ...body} = placeBody.parse(req.body);
  const ids = [...new Set([body.categoryId, ...(categoryIds ?? [])])];
  const place = await prisma.place.create({data: {...body, categories: {create: ids.map(categoryId => ({categoryId}))}}, include: placeInclude});
  await audit(req, place.id, 'ADMIN_PLACE_CREATED', 'PLACE', place.id);
  return res.status(201).json(placeDetail(place));
}));

adminRouter.patch('/places/:id', route(async (req, res) => {
  const placeId = positiveId(req.params.id);
  const {categoryIds, ...body} = placeBody.partial().parse(req.body);
  const place = await prisma.$transaction(async tx => {
    const updated = await tx.place.update({where: {id: placeId}, data: body});
    if (categoryIds) {
      const ids = [...new Set([updated.categoryId, ...categoryIds])];
      await tx.placeCategory.deleteMany({where: {placeId, categoryId: {notIn: ids}}});
      await tx.placeCategory.createMany({data: ids.map(categoryId => ({placeId, categoryId})), skipDuplicates: true});
    }
    return tx.place.findUniqueOrThrow({where: {id: placeId}, include: placeInclude});
  });
  await audit(req, placeId, 'ADMIN_PLACE_UPDATED', 'PLACE', placeId, {fields: Object.keys(body)} as Prisma.InputJsonValue);
  return res.json(placeDetail(place));
}));

// Gérants : rattache un compte existant (par e-mail) à l'établissement.
adminRouter.post('/places/:id/managers', route(async (req, res) => {
  const placeId = positiveId(req.params.id);
  const body = z.object({email: z.string().email().transform(v => v.toLowerCase().trim()), role: z.enum(['ESTABLISHMENT', 'SCANNER']).default('ESTABLISHMENT')}).parse(req.body);
  const user = await prisma.user.findUnique({where: {email: body.email}});
  if (!user) return res.status(404).json({message: 'Aucun compte avec cet e-mail. La personne doit d’abord créer un compte Barmej.'});
  await prisma.$transaction([
    ...(user.role === UserRole.USER ? [prisma.user.update({where: {id: user.id}, data: {role: body.role as UserRole}})] : []),
    prisma.placeManager.upsert({where: {userId_placeId: {userId: user.id, placeId}}, update: {}, create: {userId: user.id, placeId}}),
  ]);
  await audit(req, placeId, 'ADMIN_MANAGER_ADDED', 'USER', user.id, {role: body.role});
  const place = await prisma.place.findUniqueOrThrow({where: {id: placeId}, include: placeInclude});
  return res.status(201).json(placeDetail(place));
}));

adminRouter.delete('/places/:id/managers/:userId', route(async (req, res) => {
  const placeId = positiveId(req.params.id), userId = positiveId(req.params.userId);
  await prisma.placeManager.deleteMany({where: {placeId, userId}});
  await audit(req, placeId, 'ADMIN_MANAGER_REMOVED', 'USER', userId);
  const place = await prisma.place.findUniqueOrThrow({where: {id: placeId}, include: placeInclude});
  return res.json(placeDetail(place));
}));

/* ─────────── Abonnements ─────────── */
const subscriptionRow = (s: any) => ({
  placeId: s.placeId, placeName: s.place?.name, plan: s.plan, status: s.status, requestedPlan: s.requestedPlan,
  requestedAt: s.requestedAt, startsAt: s.startsAt, endsAt: s.endsAt, activatedAt: s.activatedAt, features: subscriptionFeatures(s.plan),
});

adminRouter.get('/subscriptions', route(async (req, res) => {
  const q = pageQuery.extend({requested: z.enum(['true', 'false']).optional(), plan: z.nativeEnum(SubscriptionPlan).optional()}).parse(req.query);
  const where: Prisma.EstablishmentSubscriptionWhereInput = {
    ...(q.requested === 'true' ? {requestedPlan: {not: null}} : {}),
    ...(q.plan ? {plan: q.plan} : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.establishmentSubscription.findMany({where, include: {place: true}, orderBy: [{requestedAt: {sort: 'desc', nulls: 'last'}}, {updatedAt: 'desc'}], skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.establishmentSubscription.count({where}),
  ]);
  return res.json(paged(rows.map(subscriptionRow), total, q.page, q.pageSize));
}));

adminRouter.put('/subscriptions/:placeId', route(async (req, res) => {
  const placeId = positiveId(req.params.placeId);
  const body = z.object({
    plan: z.nativeEnum(SubscriptionPlan),
    status: z.nativeEnum(SubscriptionStatus).default(SubscriptionStatus.ACTIVE),
    endsAt: z.coerce.date().nullable().optional(),
  }).parse(req.body);
  const now = new Date();
  const data = {plan: body.plan, status: body.status, endsAt: body.endsAt ?? null, requestedPlan: null, requestedAt: null, activatedAt: now, activatedById: actorId(req)};
  const row = await prisma.establishmentSubscription.upsert({
    where: {placeId}, update: data, create: {placeId, startsAt: now, ...data}, include: {place: true},
  });
  await audit(req, placeId, 'ADMIN_SUBSCRIPTION_SET', 'SUBSCRIPTION', row.id, {plan: body.plan, status: body.status});
  await prisma.placeManager.findMany({where: {placeId}, select: {userId: true}}).then(managers => Promise.all(managers.map(m =>
    prisma.notification.create({data: {userId: m.userId, title: 'Votre formule Barmej Pro', message: `Votre établissement ${row.place.name} est maintenant en formule ${body.plan}.`}}))));
  return res.json(subscriptionRow(row));
}));

adminRouter.delete('/subscriptions/:placeId/request', route(async (req, res) => {
  const placeId = positiveId(req.params.placeId);
  const row = await prisma.establishmentSubscription.update({where: {placeId}, data: {requestedPlan: null, requestedAt: null}, include: {place: true}});
  await audit(req, placeId, 'ADMIN_SUBSCRIPTION_REQUEST_DECLINED', 'SUBSCRIPTION', row.id);
  return res.json(subscriptionRow(row));
}));

/* ─────────── Utilisateurs ─────────── */
adminRouter.get('/users', route(async (req, res) => {
  const q = pageQuery.extend({
    q: z.string().trim().optional(),
    role: z.nativeEnum(UserRole).optional(),
    // public = clients de l'app ; pro = gérants et contrôle QR ; admin = équipe Barmej.
    kind: z.enum(['public', 'pro', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  }).parse(req.query);
  const kindRoles = q.kind === 'public' ? [UserRole.USER] : q.kind === 'pro' ? PRO_ROLES : q.kind === 'admin' ? [UserRole.ADMIN] : undefined;
  const where: Prisma.UserWhereInput = {
    ...(q.q ? {OR: [{email: {contains: q.q, mode: 'insensitive'}}, {firstName: {contains: q.q, mode: 'insensitive'}}, {lastName: {contains: q.q, mode: 'insensitive'}}, {mobile: {contains: q.q}}]} : {}),
    ...(q.role ? {role: q.role} : kindRoles ? {role: {in: kindRoles}} : {}),
    ...(q.status === 'suspended' ? {suspendedAt: {not: null}} : q.status === 'active' ? {suspendedAt: null} : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({where, include: {managedPlaces: {include: {place: {select: {id: true, name: true}}}}, _count: {select: {reservations: true, stayBookings: true, barmejliPlans: true}}}, orderBy: {createdAt: 'desc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.user.count({where}),
  ]);
  return res.json(paged(rows.map(u => ({
    ...userSummary(u), createdAt: u.createdAt, places: u.managedPlaces.map(m => m.place),
    reservations: u._count.reservations, stays: u._count.stayBookings, plans: u._count.barmejliPlans,
  })), total, q.page, q.pageSize));
}));

adminRouter.patch('/users/:id', route(async (req, res) => {
  const userId = positiveId(req.params.id);
  const body = z.object({role: z.nativeEnum(UserRole)}).parse(req.body);
  if (userId === actorId(req) && body.role !== UserRole.ADMIN) return res.status(409).json({message: 'Vous ne pouvez pas retirer votre propre rôle administrateur.'});
  const user = await prisma.user.update({where: {id: userId}, data: {role: body.role}});
  return res.json(userSummary(user));
}));

// Suspension : plus de connexion, sessions en cours coupées (jetons révoqués, accès refusé sous 30 s).
adminRouter.post('/users/:id/suspend', route(async (req, res) => {
  const userId = positiveId(req.params.id);
  const {reason} = z.object({reason: z.string().trim().max(300).optional()}).parse(req.body ?? {});
  if (userId === actorId(req)) return res.status(409).json({message: 'Vous ne pouvez pas suspendre votre propre compte.'});
  const target = await prisma.user.findUnique({where: {id: userId}, select: {role: true}});
  if (!target) return res.status(404).json({message: 'Compte introuvable'});
  if (target.role === UserRole.ADMIN) return res.status(409).json({message: 'Retirez d’abord le rôle administrateur avant de suspendre ce compte.'});
  const [user] = await prisma.$transaction([
    prisma.user.update({where: {id: userId}, data: {suspendedAt: new Date(), suspendedReason: reason || null}}),
    prisma.refreshToken.updateMany({where: {userId, revokedAt: null}, data: {revokedAt: new Date()}}),
  ]);
  forgetSuspension(userId);
  return res.json(userSummary(user));
}));

adminRouter.post('/users/:id/reactivate', route(async (req, res) => {
  const userId = positiveId(req.params.id);
  const user = await prisma.user.update({where: {id: userId}, data: {suspendedAt: null, suspendedReason: null}});
  forgetSuspension(userId);
  return res.json(userSummary(user));
}));

/* ─────────── Comptes Pro (gérants, contrôle QR) ─────────── */
const proAccountInput = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  mobile: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['ESTABLISHMENT', 'SCANNER']),
  // Mot de passe provisoire choisi par l'admin, à transmettre au gérant (jamais renvoyé par l'API).
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(128),
  placeIds: z.array(z.coerce.number().int().positive()).max(50).default([]),
});

adminRouter.post('/pro-accounts', route(async (req, res) => {
  const body = proAccountInput.parse(req.body);
  if (await prisma.user.findUnique({where: {email: body.email}, select: {id: true}})) {
    return res.status(409).json({message: 'Un compte existe déjà avec cet e-mail. Rattachez-le à l’établissement depuis la page Établissements.'});
  }
  const placeIds = [...new Set(body.placeIds)];
  if (placeIds.length && (await prisma.place.count({where: {id: {in: placeIds}}})) !== placeIds.length) {
    return res.status(400).json({message: 'Un des établissements choisis n’existe pas.'});
  }
  const user = await prisma.user.create({
    data: {
      email: body.email, firstName: body.firstName, lastName: body.lastName, mobile: body.mobile || null,
      role: body.role as UserRole, passwordHash: await bcrypt.hash(body.password, 12),
      managedPlaces: {create: placeIds.map(placeId => ({placeId}))},
    },
    include: {managedPlaces: {include: {place: {select: {id: true, name: true}}}}},
  });
  await Promise.all(placeIds.map(placeId => audit(req, placeId, 'ADMIN_PRO_ACCOUNT_CREATED', 'USER', user.id, {email: user.email, role: user.role})));
  return res.status(201).json({...userSummary(user), places: user.managedPlaces.map(m => m.place)});
}));

adminRouter.delete('/pro-accounts/:id', route(async (req, res) => {
  const userId = positiveId(req.params.id);
  if (userId === actorId(req)) return res.status(409).json({message: 'Vous ne pouvez pas supprimer votre propre compte.'});
  const user = await prisma.user.findUnique({where: {id: userId}, include: {managedPlaces: true}});
  if (!user) return res.status(404).json({message: 'Compte introuvable'});
  if (!PRO_ROLES.includes(user.role)) return res.status(409).json({message: 'Seuls les comptes Pro (gérant, contrôle QR) peuvent être supprimés ici.'});
  await Promise.all(user.managedPlaces.map(m => audit(req, m.placeId, 'ADMIN_PRO_ACCOUNT_DELETED', 'USER', user.id, {email: user.email, role: user.role})));
  await prisma.user.delete({where: {id: userId}});
  forgetSuspension(userId);
  return res.status(204).send();
}));

/* ─────────── Modération ─────────── */
adminRouter.get('/media', route(async (req, res) => {
  const q = pageQuery.extend({status: z.nativeEnum(MediaModerationStatus).optional(), type: z.enum(['COVER', 'GALLERY', 'VIDEO']).optional()}).parse(req.query);
  const where: Prisma.PlaceMediaWhereInput = {...(q.status ? {moderationStatus: q.status} : {}), ...(q.type ? {type: q.type} : {})};
  const [rows, total] = await Promise.all([
    prisma.placeMedia.findMany({where, include: {place: {select: {id: true, name: true}}}, orderBy: {createdAt: 'desc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.placeMedia.count({where}),
  ]);
  return res.json(paged(rows.map(m => ({id: m.id, placeId: m.placeId, placeName: m.place.name, url: m.secureUrl, type: m.type, keywords: m.keywords, duration: m.duration, active: m.active, status: m.moderationStatus, createdAt: m.createdAt})), total, q.page, q.pageSize));
}));

adminRouter.patch('/media/:id', route(async (req, res) => {
  const mediaId = positiveId(req.params.id);
  const body = z.object({status: z.nativeEnum(MediaModerationStatus).optional(), active: z.boolean().optional()}).parse(req.body);
  const media = await prisma.placeMedia.update({where: {id: mediaId}, data: {...(body.status ? {moderationStatus: body.status} : {}), ...(body.active !== undefined ? {active: body.active} : {})}});
  await audit(req, media.placeId, 'ADMIN_MEDIA_MODERATED', 'MEDIA', media.id, body as Prisma.InputJsonValue);
  return res.json({id: media.id, status: media.moderationStatus, active: media.active});
}));

adminRouter.get('/menus', route(async (req, res) => {
  const q = pageQuery.extend({state: z.enum(['active', 'draft', 'all']).default('all')}).parse(req.query);
  const where: Prisma.PlaceMenuWhereInput = q.state === 'active' ? {active: true} : q.state === 'draft' ? {validatedAt: null} : {};
  const [rows, total] = await Promise.all([
    prisma.placeMenu.findMany({where, include: {place: {select: {id: true, name: true}}}, orderBy: {updatedAt: 'desc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.placeMenu.count({where}),
  ]);
  return res.json(paged(rows.map(m => ({id: m.id, placeId: m.placeId, placeName: m.place.name, imageUrl: m.imageUrl, items: Array.isArray(m.items) ? m.items.length : 0, validatedAt: m.validatedAt, active: m.active, updatedAt: m.updatedAt})), total, q.page, q.pageSize));
}));

adminRouter.patch('/menus/:id', route(async (req, res) => {
  const body = z.object({active: z.boolean()}).parse(req.body);
  const menu = await prisma.placeMenu.update({where: {id: positiveId(req.params.id)}, data: {active: body.active}});
  await audit(req, menu.placeId, 'ADMIN_MENU_TOGGLED', 'MENU', menu.id, body);
  return res.json({id: menu.id, active: menu.active});
}));

adminRouter.get('/reports', route(async (req, res) => {
  const q = pageQuery.parse(req.query);
  const [rows, total] = await Promise.all([
    prisma.report.findMany({include: {user: true, place: {select: {id: true, name: true}}}, orderBy: {createdAt: 'desc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.report.count(),
  ]);
  return res.json(paged(rows.map(r => ({id: r.id, description: r.description, createdAt: r.createdAt, place: r.place, user: userSummary(r.user), flagged: containsProfanity(r.description)})), total, q.page, q.pageSize));
}));

adminRouter.delete('/reports/:id', route(async (req, res) => {
  const report = await prisma.report.delete({where: {id: positiveId(req.params.id)}});
  await audit(req, report.placeId, 'ADMIN_REPORT_CLOSED', 'REPORT', report.id, {description: report.description});
  return res.status(204).send();
}));

adminRouter.get('/reviews', route(async (req, res) => {
  const q = pageQuery.extend({placeId: z.coerce.number().int().optional()}).parse(req.query);
  const where: Prisma.ReviewWhereInput = q.placeId ? {placeId: q.placeId} : {};
  const [rows, total] = await Promise.all([
    prisma.review.findMany({where, include: {user: true, place: {select: {id: true, name: true}}}, orderBy: {createdAt: 'desc'}, skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.review.count({where}),
  ]);
  return res.json(paged(rows.map(r => ({
    id: r.id, place: r.place, user: userSummary(r.user), comment: r.comment, photos: r.photos, createdAt: r.createdAt,
    rating: Math.round(((r.cuisineRating + r.serviceRating + r.ambianceRating + r.priceRating) / 4) * 10) / 10,
    response: r.establishmentResponse,
    flagged: containsProfanity(r.comment) || containsProfanity(r.establishmentResponse),
  })), total, q.page, q.pageSize));
}));

adminRouter.delete('/reviews/:id', route(async (req, res) => {
  const review = await prisma.review.delete({where: {id: positiveId(req.params.id)}});
  await audit(req, review.placeId, 'ADMIN_REVIEW_DELETED', 'REVIEW', review.id, {comment: review.comment});
  return res.status(204).send();
}));

/* ─────────── Réservations et séjours ─────────── */
adminRouter.get('/reservations', route(async (req, res) => {
  const q = pageQuery.extend({status: z.nativeEnum(ReservationStatus).optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().trim().optional()}).parse(req.query);
  const where: Prisma.ReservationWhereInput = {
    ...(q.status ? {status: q.status} : {}),
    ...(q.from || q.to ? {reservationDate: {...(q.from ? {gte: new Date(`${q.from}T00:00:00.000Z`)} : {}), ...(q.to ? {lte: new Date(`${q.to}T00:00:00.000Z`)} : {})}} : {}),
    ...(q.q ? {OR: [{place: {name: {contains: q.q, mode: 'insensitive'}}}, {user: {email: {contains: q.q, mode: 'insensitive'}}}, {user: {firstName: {contains: q.q, mode: 'insensitive'}}}]} : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.reservation.findMany({where, include: {user: true, place: {select: {id: true, name: true}}}, orderBy: [{reservationDate: 'desc'}, {reservationTime: 'desc'}], skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.reservation.count({where}),
  ]);
  return res.json(paged(rows.map(r => ({
    id: r.id, place: r.place, user: userSummary(r.user), date: r.reservationDate.toISOString().slice(0, 10), time: r.reservationTime,
    persons: r.numberOfPersons, status: r.status, message: r.message, createdAt: r.createdAt,
  })), total, q.page, q.pageSize));
}));

adminRouter.get('/stays', route(async (req, res) => {
  const q = pageQuery.extend({status: z.nativeEnum(ReservationStatus).optional()}).parse(req.query);
  const where: Prisma.StayBookingWhereInput = q.status ? {status: q.status} : {};
  const [rows, total] = await Promise.all([
    prisma.stayBooking.findMany({where, include: {user: true, place: {select: {id: true, name: true}}}, orderBy: [{checkIn: 'desc'}], skip: (q.page - 1) * q.pageSize, take: q.pageSize}),
    prisma.stayBooking.count({where}),
  ]);
  return res.json(paged(rows.map(s => ({
    id: s.id, place: s.place, user: userSummary(s.user), checkIn: s.checkIn.toISOString().slice(0, 10), checkOut: s.checkOut.toISOString().slice(0, 10),
    nights: s.nights, guests: s.guests, rooms: s.rooms, estimate: s.estimate, status: s.status, createdAt: s.createdAt,
  })), total, q.page, q.pageSize));
}));

/* ─────────── Campagnes sponsorisées ─────────── */
adminRouter.get('/campaigns', route(async (_req, res) => {
  const rows = await prisma.sponsoredCampaign.findMany({include: {place: {select: {id: true, name: true}}, _count: {select: {impressions: true}}}, orderBy: {startsAt: 'desc'}, take: 100});
  return res.json(rows.map(c => ({
    id: c.id, name: c.name, place: c.place, active: c.active, startsAt: c.startsAt, endsAt: c.endsAt,
    dailyBudget: c.dailyBudgetCents / 100, totalBudget: c.totalBudgetCents / 100, impressions: c._count.impressions,
  })));
}));

adminRouter.patch('/campaigns/:id', route(async (req, res) => {
  const body = z.object({active: z.boolean()}).parse(req.body);
  const c = await prisma.sponsoredCampaign.update({where: {id: positiveId(req.params.id)}, data: {active: body.active}});
  await audit(req, c.placeId, 'ADMIN_CAMPAIGN_TOGGLED', 'CAMPAIGN', c.id, body);
  return res.json({id: c.id, active: c.active});
}));

/* ─────────── Statistiques (audience, conversion, Barmejli) ─────────── */
const dailyCounts = (table: string, column: string, since: Date, filter: Prisma.Sql = Prisma.empty) =>
  prisma.$queryRaw<Array<{day: string; n: number}>>`
    SELECT to_char((${Prisma.raw(`"${column}"`)} + interval '1 hour')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${column}"`)} >= ${since} ${filter}
    GROUP BY 1`;

const activeUsers = async (from: Date, to: Date) => {
  const [row] = await prisma.$queryRaw<Array<{n: number}>>`
    SELECT count(*)::int AS n FROM (
      SELECT user_id FROM place_views WHERE created_at >= ${from} AND created_at < ${to} AND user_id IS NOT NULL
      UNION
      SELECT user_id FROM feed_events WHERE occurred_at >= ${from} AND occurred_at < ${to} AND user_id IS NOT NULL
    ) AS active`;
  return Number(row?.n ?? 0);
};

adminRouter.get('/analytics', route(async (req, res) => {
  const {days} = z.object({days: z.coerce.number().int().min(7).max(90).default(30)}).parse(req.query);
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const previousSince = new Date(since.getTime() - days * DAY);
  const range = (from: Date, to: Date) => ({gte: from, lt: to});
  const totals = async (from: Date, to: Date) => {
    const [profileViews, videoViews, reservations, newUsers, plans, active] = await Promise.all([
      prisma.placeView.count({where: {createdAt: range(from, to)}}),
      prisma.feedEvent.count({where: {occurredAt: range(from, to), type: 'VIDEO_START'}}),
      prisma.reservation.count({where: {createdAt: range(from, to)}}),
      prisma.user.count({where: {createdAt: range(from, to)}}),
      prisma.barmejliPlan.count({where: {createdAt: range(from, to)}}),
      activeUsers(from, to),
    ]);
    return {profileViews, videoViews, reservations, newUsers, barmejliPlans: plans, activeUsers: active};
  };
  const [current, previous] = await Promise.all([totals(since, now), totals(previousSince, since)]);

  const [viewsDaily, videoDaily, reservationsDaily, usersDaily, plansDaily] = await Promise.all([
    dailyCounts('place_views', 'created_at', since),
    dailyCounts('feed_events', 'occurred_at', since, Prisma.sql`AND type::text = 'VIDEO_START'`),
    dailyCounts('reservations', 'created_at', since),
    dailyCounts('users', 'created_at', since),
    dailyCounts('barmejli_plans', 'created_at', since),
  ]);

  const [placeViews, sources, videoStarts, cities, moods, savedPlans, budget] = await Promise.all([
    prisma.placeView.groupBy({by: ['placeId'], where: {createdAt: {gte: since}}, _count: {_all: true}, orderBy: {_count: {placeId: 'desc'}}, take: 10}),
    prisma.placeView.groupBy({by: ['source'], where: {createdAt: {gte: since}}, _count: {_all: true}}),
    prisma.feedEvent.groupBy({by: ['videoId'], where: {occurredAt: {gte: since}, type: 'VIDEO_START'}, _count: {_all: true}, orderBy: {_count: {videoId: 'desc'}}, take: 10}),
    prisma.barmejliPlan.groupBy({by: ['city'], where: {createdAt: {gte: since}}, _count: {_all: true}, orderBy: {_count: {city: 'desc'}}, take: 8}),
    prisma.barmejliPlan.groupBy({by: ['mood'], where: {createdAt: {gte: since}}, _count: {_all: true}, orderBy: {_count: {mood: 'desc'}}, take: 6}),
    prisma.barmejliPlan.count({where: {createdAt: {gte: since}, status: 'SAVED'}}),
    prisma.barmejliPlan.aggregate({where: {createdAt: {gte: since}}, _avg: {budget: true}}),
  ]);

  const topPlaceIds = placeViews.map(row => row.placeId);
  const [places, placeVideoViews, placeReservations] = await Promise.all([
    prisma.place.findMany({where: {id: {in: topPlaceIds}}, select: {id: true, name: true, image: true}}),
    prisma.feedEvent.groupBy({by: ['placeId'], where: {placeId: {in: topPlaceIds}, occurredAt: {gte: since}, type: 'VIDEO_START'}, _count: {_all: true}}),
    prisma.reservation.groupBy({by: ['placeId'], where: {placeId: {in: topPlaceIds}, createdAt: {gte: since}}, _count: {_all: true}}),
  ]);
  const videoIds = videoStarts.map(row => row.videoId);
  const [videos, videoCompletions] = await Promise.all([
    prisma.placeMedia.findMany({where: {id: {in: videoIds}}, select: {id: true, secureUrl: true, place: {select: {id: true, name: true}}}}),
    prisma.feedEvent.groupBy({by: ['videoId'], where: {videoId: {in: videoIds}, occurredAt: {gte: since}, type: 'VIDEO_COMPLETE'}, _count: {_all: true}}),
  ]);
  const countOf = <T extends {_count: {_all: number}}>(rows: T[], match: (row: T) => boolean) => rows.find(match)?._count._all ?? 0;

  return res.json({
    periodDays: days,
    totals: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, {value, change: percentChange(value, previous[key as keyof typeof previous])}])),
    conversionRate: conversionRate(current.reservations, current.profileViews),
    daily: mergeDaily(periodDays(days, now), {profileViews: viewsDaily, videoViews: videoDaily, reservations: reservationsDaily, newUsers: usersDaily, barmejliPlans: plansDaily}),
    sources: sources
      .map(row => ({source: row.source, label: SOURCE_LABELS[row.source] ?? SOURCE_LABELS.app, views: row._count._all}))
      .sort((a, b) => b.views - a.views),
    topPlaces: placeViews.map(row => {
      const place = places.find(item => item.id === row.placeId);
      const reservations = countOf(placeReservations, item => item.placeId === row.placeId);
      return {
        id: row.placeId, name: place?.name ?? `#${row.placeId}`, image: place?.image ?? null,
        profileViews: row._count._all,
        videoViews: countOf(placeVideoViews, item => item.placeId === row.placeId),
        reservations,
        conversionRate: conversionRate(reservations, row._count._all),
      };
    }),
    topVideos: videoStarts.map(row => {
      const video = videos.find(item => item.id === row.videoId);
      const completions = countOf(videoCompletions, item => item.videoId === row.videoId);
      return {
        id: row.videoId, placeId: video?.place.id ?? null, placeName: video?.place.name ?? '—',
        url: video?.secureUrl ?? null, thumbnailUrl: video ? videoThumbnail(video.secureUrl) : null,
        views: row._count._all, completions, completionRate: row._count._all ? Math.round((completions / row._count._all) * 1000) / 10 : 0,
      };
    }),
    barmejli: {
      plans: current.barmejliPlans,
      saved: savedPlans,
      saveRate: conversionRate(savedPlans, current.barmejliPlans),
      averageBudget: budget._avg.budget ? Math.round(budget._avg.budget) : null,
      cities: cities.map(row => ({city: row.city, plans: row._count._all})),
      moods: moods.map(row => ({mood: row.mood, plans: row._count._all})),
    },
  });
}));
