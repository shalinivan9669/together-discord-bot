import { drizzle } from 'drizzle-orm/node-postgres';
import { pgPool } from './client';
import * as schema from './schema';

export const db = drizzle(pgPool, { schema, casing: 'snake_case' });
export type Db = typeof db;