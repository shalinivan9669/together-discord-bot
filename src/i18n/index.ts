import { logger } from '../lib/logger';
import { en } from './en';
import { ru, type I18nKey } from './ru';

export const supportedLocales = ['ru', 'en'] as const;
export type AppLocale = (typeof supportedLocales)[number];

type TranslationParams = Record<string, string | number>;
type Dictionary = Record<I18nKey, string>;

const dictionaries: Record<AppLocale, Dictionary> = {
  ru,
  en
};

const fallbackLocale: AppLocale = 'ru';
const isStrictMissingKeyMode = process.env.NODE_ENV !== 'production';

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

function normalizeLocale(value: unknown): AppLocale | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'ru' || normalized.startsWith('ru-')) {
    return 'ru';
  }

  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }

  return null;
}

function verifyDictionaryShape(): void {
  const ruKeys = new Set(Object.keys(ru));
  const enKeys = new Set(Object.keys(en));

  const missingInEn = [...ruKeys].filter((key) => !enKeys.has(key));
  const extraInEn = [...enKeys].filter((key) => !ruKeys.has(key));

  if (missingInEn.length === 0 && extraInEn.length === 0) {
    return;
  }

  const error = new Error(
    `i18n dictionaries are out of sync: missingInEn=${missingInEn.join(',')} extraInEn=${extraInEn.join(',')}`,
  );

  if (isStrictMissingKeyMode) {
    throw error;
  }

  logger.error({ error }, 'i18n dictionary mismatch');
}

verifyDictionaryShape();

export function resolveLocale(input: {
  guildSettingLocale?: string | null;
  guildLocale?: string | null;
  userLocale?: string | null;
}): AppLocale {
  return normalizeLocale(input.guildSettingLocale)
    ?? normalizeLocale(input.guildLocale)
    ?? normalizeLocale(input.userLocale)
    ?? fallbackLocale;
}

export function t(locale: AppLocale, key: I18nKey, params?: TranslationParams): string {
  const primary = dictionaries[locale][key];
  if (typeof primary === 'string') {
    return interpolate(primary, params);
  }

  const fallback = dictionaries[fallbackLocale][key];
  if (typeof fallback === 'string') {
    logger.warn(
      {
        feature: 'i18n',
        action: 'missing_key',
        locale,
        key
      },
      'Missing i18n key in primary locale, using fallback',
    );
    return interpolate(fallback, params);
  }

  const error = new Error(`Missing i18n key: ${key}`);
  if (isStrictMissingKeyMode) {
    throw error;
  }

  logger.error({ error, locale, key }, 'Missing i18n key in all locales');
  return key;
}

export type { I18nKey };
