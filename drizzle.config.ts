import { defineConfig } from 'drizzle-kit';
import { config as loadEnv } from 'dotenv';

loadEnv();

const dbPath = process.env.DATABASE_PATH ?? '/data/leads.db';

export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema.ts',
  out: './app/db/migrations',
  dbCredentials: {
    url: dbPath,
  },
  strict: true,
  verbose: true,
});
