import {Router} from 'express';
import {z} from 'zod';
import {AuthRequest} from './auth';
import {prisma} from './db';
import {roomsLeft, stayEstimate, validateStay} from './staysLogic';

export const staysRouter = Router();
const route = (handler: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => Promise.resolve(handler(req, res)).catch(next);
const positiveId = (value: unknown) => z.coerce.number().int().positive().parse(value);
const ACTIVE = ['PENDING', 'PROPOSED', 'CONFIRMED'] as const;
const isStayCategory = (name: string) => /maison|h[oô]te|g[iî]te|h[ée]bergement/i.test(name.normalize('NFD').replace(/[̀-ͯ]/g, ''));

const requestSchema = z.object({
  placeId: z.coerce.number().int().positive(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.coerce.number().int(),
  rooms: z.coerce.number().int().default(1),
  message: z.string().trim().max(500).optional(),
});

async function stayPlace(placeId: number) {
  const place = await prisma.place.findUnique({where: {id: placeId}, include: {category: true}});
  if (!place || !isStayCategory(place.category.name)) throw Object.assign(new Error('Maison d’hôtes introuvable'), {statusCode: 404});
  return place;
}

async function availability(placeId: number, period: {checkIn: Date; checkOut: Date}, tx: Pick<typeof prisma, 'stayBooking'> = prisma) {
  const booked = await tx.stayBooking.findMany({
    where: {placeId, status: {in: [...ACTIVE]}, checkIn: {lt: period.checkOut}, checkOut: {gt: period.checkIn}},
    select: {checkIn: true, checkOut: true, rooms: true},
  });
  return booked;
}

const bookingDto = (row: any) => ({
  id: row.id,
  placeId: row.placeId,
  placeName: row.place?.name,
  placeAddress: row.place?.address,
  placeImage: row.place?.image,
  placePhone: row.place?.phone,
  checkIn: row.checkIn.toISOString().slice(0, 10),
  checkOut: row.checkOut.toISOString().slice(0, 10),
  nights: row.nights,
  guests: row.guests,
  rooms: row.rooms,
  estimate: row.estimate,
  message: row.message,
  status: row.status,
  createdAt: row.createdAt,
});

// Disponibilités d'une maison d'hôtes pour une période.
staysRouter.get('/:placeId/availability', route(async (req: AuthRequest, res) => {
  const placeId = positiveId(req.params.placeId);
  const place = await stayPlace(placeId);
  const checked = validateStay({checkIn: String(req.query.checkIn ?? ''), checkOut: String(req.query.checkOut ?? ''), guests: Number(req.query.guests ?? 1), rooms: Number(req.query.rooms ?? 1)});
  if ('error' in checked) return res.status(400).json({message: checked.error});
  const left = roomsLeft(place.roomCount, await availability(placeId, checked), checked);
  const rooms = Number(req.query.rooms ?? 1);
  return res.json({
    placeId,
    nights: checked.nights,
    nightlyPrice: place.nightlyPrice,
    roomCount: place.roomCount,
    roomsLeft: left,
    // null : la maison n'a pas déclaré ses chambres, l'hôte confirmera.
    available: left == null ? null : left >= rooms,
    estimate: stayEstimate(place.nightlyPrice, checked.nights, rooms),
  });
}));

// Demande de séjour : enregistrée « en attente », l'hôte confirme.
staysRouter.post('/bookings', route(async (req: AuthRequest, res) => {
  const body = requestSchema.parse(req.body);
  const checked = validateStay(body);
  if ('error' in checked) return res.status(400).json({message: checked.error});
  const place = await stayPlace(body.placeId);
  const booking = await prisma.$transaction(async tx => {
    const left = roomsLeft(place.roomCount, await availability(body.placeId, checked, tx), checked);
    if (left != null && left < body.rooms) throw Object.assign(new Error(left ? `Il reste ${left} chambre(s) pour ces dates.` : 'Complet pour ces dates. Essayez d’autres dates.'), {statusCode: 409});
    return tx.stayBooking.create({
      data: {
        userId: req.userId, placeId: body.placeId, checkIn: checked.checkIn, checkOut: checked.checkOut, nights: checked.nights,
        guests: body.guests, rooms: body.rooms, message: body.message || null, estimate: stayEstimate(place.nightlyPrice, checked.nights, body.rooms),
      },
      include: {place: true},
    });
  }, {isolationLevel: 'Serializable'});
  return res.status(201).json(bookingDto(booking));
}));

staysRouter.get('/bookings', route(async (req: AuthRequest, res) => {
  const rows = await prisma.stayBooking.findMany({where: {userId: req.userId}, include: {place: true}, orderBy: {checkIn: 'desc'}});
  return res.json(rows.map(bookingDto));
}));

staysRouter.patch('/bookings/:id/cancel', route(async (req: AuthRequest, res) => {
  const id = positiveId(req.params.id);
  const result = await prisma.stayBooking.updateMany({where: {id, userId: req.userId, status: {in: [...ACTIVE]}}, data: {status: 'CANCELLED'}});
  if (!result.count) return res.status(404).json({message: 'Séjour introuvable ou déjà terminé'});
  return res.json({cancelled: true});
}));
