import { isFeatureEnabled } from '../../config/featureFlags';

export function disabledFeatureMessage(feature: string): string {
  return `${feature} is not enabled for this deployment.`;
}

export function assertFeatureEnabled(feature: 'oracle' | 'checkin' | 'anon' | 'raid' | 'seasons') {
  if (!isFeatureEnabled(feature)) {
    throw new Error(disabledFeatureMessage(feature));
  }
}
