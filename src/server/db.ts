import 'server-only';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@/lib/env';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export function db() {
  return (globalDb.db ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
  }));
}
export async function owner() {
  return db().user.findUniqueOrThrow({ where: { email: env().OWNER_EMAIL } });
}
