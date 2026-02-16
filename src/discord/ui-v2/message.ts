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

export type ComponentsV2Message = {
  components: APIMessageTopLevelComponent[];
  content?: string;
};

export type ComponentsV2Edit = {
  components?: APIMessageTopLevelComponent[];
  content?: string | null;
};

export function toComponentsV2CreateBody(message: ComponentsV2Message): RESTPostAPIChannelMessageJSONBody {
  return {
    content: message.content,
    components: message.components,
    flags: COMPONENTS_V2_FLAGS
  };
}

export function toComponentsV2EditBody(message: ComponentsV2Edit): RESTPatchAPIChannelMessageJSONBody {
  return {
    content: message.content,
    components: message.components,
    flags: COMPONENTS_V2_FLAGS
  };
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
