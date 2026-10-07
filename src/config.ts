import 'dotenv/config';
import {z} from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8090),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGIN: z.string().default('*'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  REDIS_URL: z.string().trim().optional(),
  FEED_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
});

export const config = schema.parse(process.env);
