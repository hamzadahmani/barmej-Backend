import {z} from 'zod';
const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
export const proPlaceSchema = z.object({
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
  ambienceTags: z.array(z.string().trim().min(1).max(50)).max(12).optional(),
});


// Undefined means unchanged; an explicit empty string/null clears an optional field.
export function placeProfileUpdate(body: z.infer<typeof proPlaceSchema>) {
  const categoryIds = [...new Set(body.categoryIds)];
  const clean = (value?: string | null) => value === undefined ? undefined : value?.trim() || null;
  return {
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
    averagePrice: body.averagePrice,
    capacityPerSlot: body.capacityPerSlot,
    cuisineType: clean(body.cuisineType),
    ambienceTags: body.ambienceTags === undefined ? undefined : [...new Set(body.ambienceTags.map(tag => tag.trim()).filter(Boolean))],
    categories: {deleteMany: {}, create: categoryIds.map(categoryId => ({categoryId}))},
  };
}
