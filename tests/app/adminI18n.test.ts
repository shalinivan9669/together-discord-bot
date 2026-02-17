import { describe, expect, it } from 'vitest';
import { createAdminTranslator, resolveAdminLocale } from '../../src/discord/admin/i18n';

describe('admin i18n', () => {
  it('defaults to russian locale', () => {
    expect(resolveAdminLocale(undefined)).toBe('ru');
  });

  it('renders russian status title and interpolation', () => {
    const { t } = createAdminTranslator('ru');

    expect(t('status.title')).toBe('Статус администратора');
    expect(
      t('reason.enabled_not_configured', {
        details: 'канал не выбран',
      }),
    ).toBe('включено, но не настроено (канал не выбран)');
  });

  it('can render english locale', () => {
    const { t } = createAdminTranslator('en');

    expect(t('status.title')).toBe('Admin Status');
    expect(t('schedule.enabled')).toBe('enabled');
  });
});
