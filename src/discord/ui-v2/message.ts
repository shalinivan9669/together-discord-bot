import type { Client } from 'discord.js';
import {
  MessageFlags,
  Routes,
  type APIMessage,
  type APIMessageTopLevelComponent,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageJSONBody,
} from './api';

export const COMPONENTS_V2_FLAGS = MessageFlags.IsComponentsV2;

const LEGACY_V2_FIELDS = [
  'content',
  'embeds',
  'allowedMentions',
  'allowed_mentions',
  'files',
  'attachments'
] as const;

export type ComponentsV2Message = {
  components: APIMessageTopLevelComponent[];
  flags?: number;
};

export type ComponentsV2Edit = {
  components: APIMessageTopLevelComponent[];
  flags?: number | null;
};

function hasComponentsV2Flag(payload: { flags?: number | null }): boolean {
  const flags = payload.flags ?? 0;
  return (flags & COMPONENTS_V2_FLAGS) === COMPONENTS_V2_FLAGS;
}

export function assertNoLegacyFieldsForV2(payload: Record<string, unknown>): void {
  if (!hasComponentsV2Flag(payload as { flags?: number | null })) {
    return;
  }

  const presentLegacyFields = LEGACY_V2_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );

  if (presentLegacyFields.length === 0) {
    return;
  }

  throw new Error(
    `Components v2 payload cannot include legacy fields: ${presentLegacyFields.join(', ')}.`,
  );
}

function toComponentsV2Flags(flags?: number | null): number {
  return (flags ?? 0) | COMPONENTS_V2_FLAGS;
}

export function toComponentsV2CreateBody(message: ComponentsV2Message): RESTPostAPIChannelMessageJSONBody {
  const guardPayload = {
    ...message,
    flags: toComponentsV2Flags(message.flags)
  };
  assertNoLegacyFieldsForV2(guardPayload as Record<string, unknown>);

  const body: RESTPostAPIChannelMessageJSONBody = {
    components: message.components,
    flags: guardPayload.flags
  };
  return body;
}

export function toComponentsV2EditBody(message: ComponentsV2Edit): RESTPatchAPIChannelMessageJSONBody {
  const guardPayload = {
    ...message,
    flags: toComponentsV2Flags(message.flags)
  };
  assertNoLegacyFieldsForV2(guardPayload as Record<string, unknown>);

  const body: RESTPatchAPIChannelMessageJSONBody = {
    components: message.components,
    flags: guardPayload.flags
  };
  return body;
}

export async function sendComponentsV2Message(
  client: Client,
  channelId: string,
  message: ComponentsV2Message,
): Promise<{ id: string }> {
  const created = await client.rest.post(Routes.channelMessages(channelId), {
    body: toComponentsV2CreateBody(message)
  }) as APIMessage;

  return { id: created.id };
}

export async function editComponentsV2Message(
  client: Client,
  channelId: string,
  messageId: string,
  message: ComponentsV2Edit,
): Promise<void> {
  await client.rest.patch(Routes.channelMessage(channelId, messageId), {
    body: toComponentsV2EditBody(message)
  });
}
