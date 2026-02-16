import { z } from 'zod';

const envelopeSchema = z.object({
  prefix: z.literal('tb'),
  version: z.literal('1'),
  feature: z.string().min(1).max(24),
  action: z.string().min(1).max(24),
  payload: z.record(z.string(), z.string()).default({})
});

export type CustomIdEnvelope = z.infer<typeof envelopeSchema>;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function encodeCustomId(input: {
  feature: string;
  action: string;
  payload?: Record<string, string>;
}): string {
  const payload = input.payload ?? {};
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const candidate = ['tb', '1', input.feature, input.action, encodedPayload].join('|');

  if (candidate.length > 100) {
    throw new Error(`customId too long: ${candidate.length} characters`);
  }

  return candidate;
}

export function decodeCustomId(customId: string): CustomIdEnvelope {
  const parts = customId.split('|');
  if (parts.length !== 5) {
    throw new Error('Invalid customId format');
  }

  const [prefix, version, feature, action, encodedPayload] = parts;
  let payload: Record<string, string> = {};

  if (encodedPayload) {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    payload = z.record(z.string(), z.string()).parse(parsed);
  }

  return envelopeSchema.parse({
    prefix,
    version,
    feature,
    action,
    payload
  });
}