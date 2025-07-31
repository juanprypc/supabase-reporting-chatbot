import { Pool } from 'pg';

export const pgPool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
});
