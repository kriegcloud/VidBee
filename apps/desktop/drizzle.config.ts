import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/lib/database/schema.ts',
  // Drizzle 1.0 timestamp directories contain migration.sql and snapshot.json.
  out: './resources/drizzle',
  dialect: 'sqlite'
})
