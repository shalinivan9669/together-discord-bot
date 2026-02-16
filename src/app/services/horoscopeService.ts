import { isFeatureEnabled } from '../../config/featureFlags';

export function ensureHoroscopeEnabled(): void {
  if (!isFeatureEnabled('horoscope')) {
    throw new Error('Horoscope feature is disabled');
  }
}