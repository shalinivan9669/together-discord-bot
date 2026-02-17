import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPONENTS_V2_FLAGS, ComponentType } from '../../src/discord/ui-v2';

function createClientWithPatch(patch: ReturnType<typeof vi.fn>) {
  return {
    rest: {
      patch
    }
  };
}

describe('ThrottledMessageEditor Discord retry behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'https://example.com';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries transient Discord API failures', async () => {
    vi.useFakeTimers();
    const patch = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({});

    const { ThrottledMessageEditor } = await import('../../src/discord/projections/messageEditor');
    const editor = new ThrottledMessageEditor(createClientWithPatch(patch) as never, 0);
    const queued = editor.queueEdit({
      channelId: 'c1',
      messageId: 'm1',
      flags: COMPONENTS_V2_FLAGS,
      components: [{ type: ComponentType.TextDisplay, content: 'hello' }]
    });

    await vi.runAllTimersAsync();
    await queued;

    expect(patch).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable Discord API errors', async () => {
    const patch = vi.fn().mockRejectedValue({ status: 400 });
    const { ThrottledMessageEditor } = await import('../../src/discord/projections/messageEditor');
    const editor = new ThrottledMessageEditor(createClientWithPatch(patch) as never, 0);

    await expect(
      editor.queueEdit({
        channelId: 'c1',
        messageId: 'm1',
        flags: COMPONENTS_V2_FLAGS,
        components: [{ type: ComponentType.TextDisplay, content: 'hello' }]
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));

    expect(patch).toHaveBeenCalledTimes(1);
  });
});
