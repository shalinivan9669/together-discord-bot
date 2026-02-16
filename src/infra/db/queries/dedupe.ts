import { createHash } from 'node:crypto';
import { db } from '../drizzle';
import { opDedup } from '../schema';

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function rememberOperation(operationKey: string, payload: unknown): Promise<boolean> {
  const hash = payloadHash(payload);
  const result = await db
    .insert(opDedup)
    .values({ operationKey, payloadHash: hash })
    .onConflictDoNothing({ target: opDedup.operationKey })
    .returning({ operationKey: opDedup.operationKey });

  return result.length > 0;
}