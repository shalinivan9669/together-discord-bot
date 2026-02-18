import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('astro/oracle separation guardrails', () => {
  it('astro modules do not import oracle services or oracle projections', () => {
    const astroFiles = [
      'src/app/services/astroHoroscopeService.ts',
      'src/discord/commands/horoscope.ts',
      'src/discord/projections/astroHoroscope.ts',
      'src/discord/projections/astroHoroscopeRenderer.ts'
    ];

    for (const file of astroFiles) {
      const content = read(file);
      expect(content).not.toMatch(/oracleService|oracleWeekly|content_oracle|oracle_claims/i);
    }
  });

  it('oracle modules do not import astro services or astro projections', () => {
    const oracleFiles = [
      'src/app/services/oracleService.ts',
      'src/discord/commands/oracle.ts',
      'src/discord/projections/oracleWeekly.ts',
      'src/discord/projections/oracleWeeklyRenderer.ts'
    ];

    for (const file of oracleFiles) {
      const content = read(file);
      expect(content).not.toMatch(/astroHoroscope|astro_cycles|astro_claims|content_astro/i);
    }
  });
});
