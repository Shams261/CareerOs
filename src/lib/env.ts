import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v)),
  OWNER_EMAIL: z.email(),
  APP_PASSWORD: z.string().min(16),
  CRON_SECRET: z.string().min(32),
});
export function env() {
  return schema.parse(process.env);
}
