import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import {
  databaseSslFromEnv,
  prismaCliConnectionString,
} from './src/lib/database';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    // Migrations also run in UTC sessions; conversions must still name their zone explicitly.
    // DATABASE_SSL is honoured here too, translated to the CLI's own URL parameters.
    url: prismaCliConnectionString(
      process.env.DATABASE_URL ??
        'postgresql://careeros:careeros@localhost:5432/careeros',
      databaseSslFromEnv(),
    ),
  },
});
