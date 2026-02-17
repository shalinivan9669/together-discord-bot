import { describe, expect, it } from 'vitest';
import {
  COMPONENTS_V2_FLAGS,
  ComponentType,
  assertNoLegacyFieldsForV2,
  toComponentsV2CreateBody,
} from '../../src/discord/ui-v2';

describe('components v2 payload guard', () => {
  it('rejects legacy fields when components v2 flag is set', () => {
    expect(() =>
      assertNoLegacyFieldsForV2({
        flags: COMPONENTS_V2_FLAGS,
        components: [],
        content: 'legacy'
      }),
    ).toThrow(/legacy fields: content/i);
  });

  it('builds v2 create body without legacy fields', () => {
    const body = toComponentsV2CreateBody({
      components: [{ type: ComponentType.TextDisplay, content: 'ok' }]
    });

    expect(body.flags).toBe(COMPONENTS_V2_FLAGS);
    expect('content' in body).toBe(false);
    expect(() => assertNoLegacyFieldsForV2(body as Record<string, unknown>)).not.toThrow();
  });
});
