import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureSeasonsEnabled(): void {
  if (!isFeatureEnabled('seasons')) {
    throw new Error('Seasons feature is disabled');
  }
}