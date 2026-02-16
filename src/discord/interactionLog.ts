import type { Interaction } from 'discord.js';
import { logger } from '../lib/logger';

export function logInteraction(params: {
  interaction: Interaction;
  feature: string;
  action: string;
  correlationId: string;
  pairId?: string | null;
  jobId?: string | null;
}) {
  logger.info(
    {
      guild_id: params.interaction.guildId,
      user_id: params.interaction.user?.id,
      pair_id: params.pairId ?? null,
      correlation_id: params.correlationId,
      interaction_id: params.interaction.id,
      feature: params.feature,
      action: params.action,
      job_id: params.jobId ?? null
    },
    'interaction',
  );
}