import { Pool } from 'pg';
import { env } from '../../config/env';

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

export async function checkDbHealth(): Promise<boolean> {
  const client = await pgPool.connect();
  try {
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    client.release();
  }
}