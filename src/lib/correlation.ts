import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type CorrelationContext = {
  correlationId: string;
};

const storage = new AsyncLocalStorage<CorrelationContext>();

export function createCorrelationId(): string {
  return randomUUID();
}

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string {
  return storage.getStore()?.correlationId ?? createCorrelationId();
}