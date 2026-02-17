import { getGuildConfig } from '../app/services/guildConfigService';
import { resolveLocale, t, type AppLocale, type I18nKey } from '../i18n';

type LocaleAwareInteraction = {
  guildId: string | null;
  guildLocale?: string | null;
  locale?: string | null;
};

export async function resolveInteractionLocale(interaction: LocaleAwareInteraction): Promise<AppLocale> {
  const guildSettingLocale = interaction.guildId
    ? (await getGuildConfig(interaction.guildId)).locale
    : null;

  return resolveLocale({
    guildSettingLocale,
    guildLocale: interaction.guildLocale,
    userLocale: interaction.locale
  });
}

export async function createInteractionTranslator(interaction: LocaleAwareInteraction): Promise<{
  locale: AppLocale;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}> {
  const locale = await resolveInteractionLocale(interaction);

  return {
    locale,
    t: (key, params) => t(locale, key, params)
  };
}

export function createTranslator(locale: AppLocale): {
  locale: AppLocale;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
} {
  return {
    locale,
    t: (key, params) => t(locale, key, params)
  };
}
