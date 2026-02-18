import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('oracle snowflake guard', () => {
  it('does not use int casts/parsing in oracle refresh path', () => {
    const oraclePathFiles = [
      'src/discord/projections/oracleWeekly.ts',
      'src/app/services/oracleService.ts',
      'src/discord/interactions/setupWizard.ts',
    ];

    const forbiddenPatterns = [
      /::\s*int(?:eger|2|4|8)?\b/i,
      /cast\([^)]*\bas\s+int(?:eger|2|4|8)?\b/i,
      /Number\.parseInt\(/,
      /\bparseInt\(/,
    ];

    for (const file of oraclePathFiles) {
      const content = read(file);
      for (const pattern of forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
