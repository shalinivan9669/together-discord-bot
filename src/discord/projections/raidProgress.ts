import { isFeatureEnabled } from '../../config/featureFlags';
import { logger } from '../../lib/logger';

export async function refreshRaidProgressProjection(): Promise<void> {
  if (!isFeatureEnabled('raid')) {
    logger.debug({ feature: 'raid' }, 'Raid projection skipped because feature is disabled');
    return;
  }

  logger.info({ feature: 'raid' }, 'Raid progress projection TODO placeholder');
}