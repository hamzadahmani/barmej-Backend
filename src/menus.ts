import {Router, Request, Response} from 'express';
import {randomUUID} from 'node:crypto';
import {v2 as cloudinary} from 'cloudinary';
import {z} from 'zod';
import {prisma} from './db';
import {config} from './config';
import {menuItemsSchema} from './menuLogic';
import {extractMenuPhoto} from './menuOcr';

type Access = (req: Request, res: Response, placeId: number) => Promise<boolean>;
const jobs = new Map<number, {state: string; message?: string}>();
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const ready = () => Boolean(config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET);
const dto = (menu: any) => ({id: menu.id, imageUrl: menu.imageUrl, draftItems: menu.draftItems, items: menu.items, active: menu.active, validatedAt: menu.validatedAt, updatedAt: menu.updatedAt});

export function createMenuRouter(access: Access) {
  const router = Router({mergeParams: true});
  const route = (handler: (req: Request, res: Response, placeId: number) => Promise<unknown>) =>
    (req: Request, res: Response, next: any) => { Promise.resolve().then(async () => {
      const placeId = id(req.params.placeId);
      if (await access(req, res, placeId)) return handler(req, res, placeId);
    }).catch(next); };
  router.get('/', route(async (_req, res, placeId) => res.json((await prisma.placeMenu.findMany({where: {placeId}, orderBy: {createdAt: 'desc'}})).map(dto))));
  router.post('/signature', route(async (_req, res, placeId) => {
    if (!ready()) return res.status(503).json({message: 'L’envoi de photos n’est pas encore configuré.'});
    if (await prisma.placeMenu.count({where: {placeId}}) >= 20) return res.status(409).json({message: 'Maximum 20 photos de menus.'});
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `barmej/places/${placeId}/menus/${randomUUID()}`;
    const parameters = {public_id: publicId, timestamp, overwrite: false};
    return res.json({cloudName: config.CLOUDINARY_CLOUD_NAME, apiKey: config.CLOUDINARY_API_KEY, timestamp, publicId, signature: cloudinary.utils.api_sign_request(parameters, config.CLOUDINARY_API_SECRET!), uploadUrl: `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/upload`});
  }));
  router.post('/complete', route(async (req, res, placeId) => {
    if (!ready()) return res.status(503).json({message: 'L’envoi de photos n’est pas encore configuré.'});
    const body = z.object({publicId: z.string().max(255), version: z.number().int().positive(), signature: z.string().regex(/^[a-f0-9]{40}$/i)}).parse(req.body);
    if (!body.publicId.startsWith(`barmej/places/${placeId}/menus/`) || !/\/menus\/[a-f0-9-]{36}$/.test(body.publicId)) return res.status(403).json({message: 'Cette photo n’appartient pas à cet établissement.'});
    const expected = cloudinary.utils.api_sign_request({public_id: body.publicId, version: body.version}, config.CLOUDINARY_API_SECRET!);
    if (expected !== body.signature) return res.status(400).json({message: 'Réponse photo invalide.'});
    const resource = await cloudinary.api.resource(body.publicId, {resource_type: 'image'});
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(resource.format) || resource.bytes > 8 * 1024 * 1024 || resource.width * resource.height > 20_000_000) return res.status(413).json({message: 'Choisissez une photo JPG, PNG ou WebP de moins de 8 Mo et 20 mégapixels.'});
    const imageUrl = cloudinary.url(body.publicId, {secure: true, version: resource.version, format: resource.format});
    const menu = await prisma.$transaction(async tx => {
      const existing = await tx.placeMenu.findUnique({where: {publicId: body.publicId}});
      if (existing) return existing;
      if (await tx.placeMenu.count({where: {placeId}}) >= 20) throw Object.assign(new Error('Maximum 20 photos de menus.'), {statusCode: 409});
      return tx.placeMenu.create({data: {placeId, publicId: body.publicId, imageUrl}});
    }, {isolationLevel: 'Serializable'});
    return res.status(201).json(dto(menu));
  }));
  router.post('/:menuId/extract', route(async (req, res, placeId) => {
    const menu = await prisma.placeMenu.findFirst({where: {id: id(req.params.menuId), placeId}});
    if (!menu) return res.status(404).json({message: 'Menu introuvable.'});
    if (jobs.get(menu.id)?.state === 'PROCESSING') return res.status(202).json({state: 'PROCESSING'});
    if ([...jobs.values()].filter(job => job.state === 'PROCESSING').length >= 2) return res.status(429).json({message: 'Lecture occupée. Réessayez dans un instant.'});
    // Bound the in-memory status history; documents themselves remain in the database.
    if (jobs.size > 1000) for (const [key, job] of jobs) if (job.state !== 'PROCESSING') jobs.delete(key);
    jobs.set(menu.id, {state: 'PROCESSING'});
    void extractMenuPhoto(menu.imageUrl).then(async result => {
      const updated = await prisma.placeMenu.updateMany({where: {id: menu.id, placeId, updatedAt: menu.updatedAt}, data: {draftItems: result.items, ocrText: result.text}});
      jobs.set(menu.id, updated.count ? {state: 'READY'} : {state: 'FAILED', message: 'Le menu a changé pendant la lecture. Rechargez-le.'});
    }).catch(() => jobs.set(menu.id, {state: 'FAILED', message: 'Lecture impossible. Utilisez une photo plus nette ou ajoutez les lignes manuellement.'}));
    return res.status(202).json({state: 'PROCESSING'});
  }));
  router.get('/:menuId/extraction', route(async (req, res, placeId) => {
    const menu = await prisma.placeMenu.findFirst({where: {id: id(req.params.menuId), placeId}});
    if (!menu) return res.status(404).json({message: 'Menu introuvable.'});
    return res.json({...jobs.get(menu.id) ?? {state: 'IDLE'}, menu: dto(menu)});
  }));
  router.post('/:menuId/validate', route(async (req, res, placeId) => {
    const body = z.object({items: menuItemsSchema, reviewed: z.literal(true), updatedAt: z.string().datetime()}).parse(req.body);
    const menuId = id(req.params.menuId);
    const result = await prisma.placeMenu.updateMany({where: {id: menuId, placeId, updatedAt: new Date(body.updatedAt)}, data: {items: body.items, draftItems: body.items, active: true, validatedAt: new Date()}});
    if (!result.count) return res.status(409).json({message: 'Le menu a changé ou n’est pas accessible. Rechargez-le avant de valider.'});
    return res.json(dto(await prisma.placeMenu.findFirstOrThrow({where: {id: menuId, placeId}})));
  }));
  router.patch('/:menuId/disable', route(async (req, res, placeId) => {
    const result = await prisma.placeMenu.updateMany({where: {id: id(req.params.menuId), placeId}, data: {active: false}});
    if (!result.count) return res.status(404).json({message: 'Menu introuvable.'});
    return res.json({disabled: true});
  }));
  return router;
}
