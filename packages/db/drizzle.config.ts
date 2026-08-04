import { defineConfig } from 'drizzle-kit'
import { DEV_DATABASE_URL } from './src/defaults'

export default defineConfig({
  schema: './packages/db/src/schema.ts',
  out: './packages/db/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEV_DATABASE_URL,
  },
})
