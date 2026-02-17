import { beforeAll, describe, expect, it } from 'vitest';

let resolveLocale: (input: {
  guildSettingLocale?: string | null;
  guildLocale?: string | null;
  userLocale?: string | null;
}) => 'ru' | 'en';

let translate: (locale: 'ru' | 'en', key: string, params?: Record<string, string | number>) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'https://example.com/db';
  const mod = await import('../../src/i18n');
  resolveLocale = mod.resolveLocale;
  translate = mod.t as unknown as typeof translate;
});

describe('admin i18n', () => {
  it('defaults to russian locale', () => {
    expect(resolveLocale({})).toBe('ru');
  });

  it('renders russian status title and interpolation', () => {
    expect(translate('ru', 'admin.status.title')).toBe('Статус администратора');
    expect(
      translate('ru', 'admin.status.reason.enabled_not_configured', {
        details: 'канал не выбран',
      }),
    ).toBe('включено, но не настроено (канал не выбран)');
  });

  it('can render english locale', () => {
    expect(translate('en', 'admin.status.title')).toBe('Admin Status');
    expect(translate('en', 'common.enabled')).toBe('enabled');
  });
});
