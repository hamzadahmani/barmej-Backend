import {Router} from 'express';
import {z} from 'zod';
import {prisma} from './db';
import {AuthRequest, requireAuth} from './auth';
import {placeDto} from './mappers';
import {interestCatalog} from './interests';
import {distanceKm, placeInterests, recommendationScore, reviewSummary} from './discoveryLogic';

type Availability = (db: typeof prisma, placeId: number, date: string, guests: number) => Promise<{slots: Array<{time: string; available: boolean; status?: string}>} | null>;
export function discoveryRouter(getAvailability: Availability) {
  const router = Router();
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const query = z.object({latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional(), recent: z.string().max(200).optional(), interest: z.enum(interestCatalog.map(item => item.key) as [string, ...string[]]).optional()}).refine(value => (value.latitude == null) === (value.longitude == null), 'Coordonnées incomplètes').parse(req.query);
      const recentIds = query.recent ? z.array(z.coerce.number().int().positive()).max(12).parse(query.recent.split(',')) : [];
      const userId = (req as AuthRequest).userId;
      const now = new Date();
      const [user, rows, favorites, watched] = await Promise.all([
        prisma.user.findUniqueOrThrow({where: {id: userId}, select: {interests: true, preferredBudget: true, favoriteAmbiences: true}}),
        prisma.place.findMany({include: {category: true, categories: true, media: {where: {active: true, moderationStatus: 'APPROVED'}, select: {keywords: true}}, reviews: {select: {cuisineRating: true, serviceRating: true, ambianceRating: true, priceRating: true}}}, orderBy: {id: 'asc'}}),
        prisma.favorite.findMany({where: {userId}, select: {placeId: true}}),
        prisma.userVideoState.findMany({where: {userId, hidden: false, totalWatchMs: {gt: 0}}, orderBy: {lastSeenAt: 'desc'}, take: 12, select: {placeId: true, videoId: true}}),
      ]);
      const affinity = new Set([...favorites.map(item => item.placeId), ...watched.map(item => item.placeId), ...recentIds]);
      const places = rows.map(place => ({...placeDto(place), ...reviewSummary(place.reviewsEnabled, place.reviews), interests: placeInterests(place), createdAt: place.createdAt.toISOString(), distance: query.latitude == null || query.longitude == null ? null : distanceKm({latitude: query.latitude, longitude: query.longitude}, place)}));
      const ranked = [...places].sort((a, b) => recommendationScore({...b, id: b.idPlace}, user, affinity) - recommendationScore({...a, id: a.idPlace}, user, affinity) || a.idPlace - b.idPlace);
      if (query.interest) return res.json(ranked.filter(place => place.interests.includes(query.interest as typeof place.interests[number])));
      const today = now.toISOString().slice(0, 10);
      const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
      // Availability uses the reservation API's UTC convention. Only offer future slots in the next hour.
      const availableNow = [];
      for (const place of ranked.slice(0, 24)) {
        const availability = await getAvailability(prisma, place.idPlace, today, 2);
        const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${now.getUTCMinutes() < 30 ? '00' : '30'}`;
        const currentSlot = availability?.slots.find(item => item.time === currentTime);
        if (!currentSlot || currentSlot.status === 'CLOSED') continue;
        const slot = availability?.slots.find(item => {const [hour, minutes] = item.time.split(':').map(Number); const start = (hour ?? 0) * 60 + (minutes ?? 0); return item.available && start >= minute && start <= minute + 60;});
        if (slot) availableNow.push({...place, availableDate: today, availableTime: slot.time});
        if (availableNow.length === 6) break;
      }
      const events = await prisma.placeEvent.findMany({where: {active: true, OR: [{endDate: {gte: new Date(`${today}T00:00:00Z`)}}, {endDate: null, startDate: {gte: new Date(`${today}T00:00:00Z`)}}, {endDate: null, startDate: null}]}, orderBy: [{startDate: 'asc'}, {id: 'desc'}], take: 12});
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({
        forYou: ranked.slice(0, 8), availableNow,
        interests: interestCatalog.map(item => ({...item, count: places.filter(place => place.interests.includes(item.key)).length})),
        nearby: places.filter(place => place.distance != null && place.distance <= 20).sort((a, b) => a.distance! - b.distance!).slice(0, 3),
        recent: [...new Set([...recentIds, ...watched.map(item => item.placeId)])].map(id => places.find(place => place.idPlace === id)).filter(Boolean).slice(0, 8),
        newPlaces: places.filter(place => now.getTime() - Date.parse(place.createdAt) >= 0 && now.getTime() - Date.parse(place.createdAt) <= 30 * 86400000).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
        events: events.map(event => ({idEvent: event.id, idPlace: event.placeId, title: event.title, description: event.description, startDate: event.startDate, endDate: event.endDate, place: places.find(place => place.idPlace === event.placeId)})).filter(event => event.place),
        offers: rows.filter(place => place.happyHour?.trim()).slice(0, 8).map(place => ({idPlace: place.id, title: 'Happy hour', description: place.happyHour!, place: places.find(item => item.idPlace === place.id)!})),
      });
    } catch (error) { next(error); }
  });
  return router;
}
