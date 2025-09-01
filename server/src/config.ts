import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('::'),
  LOG_LEVEL: z.string().default('info'),
  ROOM_PREFIX_ENFORCE: z.coerce.boolean().default(false),
});

export const config = configSchema.parse(process.env);
