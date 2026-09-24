import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { utcConnectionString } from './src/lib/database';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    // Migrations also run in UTC sessions; conversions must still name their zone explicitly.
    url: utcConnectionString(
      process.env.DATABASE_URL ??
        'postgresql://careeros:careeros@localhost:5432/careeros',
    ),
  },
});
