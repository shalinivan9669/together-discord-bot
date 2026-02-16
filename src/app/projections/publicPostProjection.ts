import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { JobNames } from '../../infra/queue/jobs';

export async function requestPublicPostPublish(
  boss: PgBoss,
  params: {
    guildId: string;
    scheduledPostId?: string;
    interactionId?: string;
    userId?: string;
    reason: string;
    correlationId?: string;
  },
) {
  const correlationId = params.correlationId ?? createCorrelationId();

  return boss.send(
    JobNames.PublicPostPublish,
    {
      correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'public_post',
      action: params.reason,
      scheduledPostId: params.scheduledPostId
    },
    {
      singletonKey: params.scheduledPostId
        ? `public-post:${params.scheduledPostId}`
        : `public-post:due:${params.guildId}`,
      singletonSeconds: 6,
      retryLimit: 3
    },
  );
}
