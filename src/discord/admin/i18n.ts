import type { GuildLocale } from '../../app/services/guildConfigService';

const dictionary = {
  ru: {
    'status.title': 'Статус администратора',
    'section.features': 'Функции',
    'section.schedules': 'Расписания',
    'section.config': 'Конфигурация',
    'section.permissions': 'Права',
    'section.next_actions': 'Что осталось настроить',

    'feature.horoscope': 'Гороскоп',
    'feature.anon': 'Анонимные вопросы',
    'feature.raid': 'Рейд сервера',
    'feature.checkin': 'Еженедельный чек-ин',
    'feature.hall': 'Зал славы',
    'feature.public_post': 'Публичные посты',

    'reason.disabled_by_admin': 'отключено администратором',
    'reason.enabled_not_configured': 'включено, но не настроено ({details})',
    'reason.configured': 'настроено',
    'reason.channel_not_selected': 'канал не выбран',
    'reason.anon_mod_role_not_selected': 'роль модератора не выбрана',
    'reason.permissions_missing': 'не хватает прав ({missing})',
    'reason.schedule_feature_disabled_skip': 'фича отключена — задания будут пропускаться',

    'schedule.enabled': 'включено',
    'schedule.disabled': 'отключено',

    'value.not_set': 'не задано',
    'value.ok': 'ok',

    'action.enable_all_features': 'Включите все функции сервера: `/admin feature enable-all`',
    'action.pick_pair_category': 'Выберите категорию для пар: `/setup start`',
    'action.pick_horoscope_channel': 'Выберите канал для гороскопа: `/setup start`',
    'action.pick_raid_channel': 'Выберите канал для рейда: `/setup start`',
    'action.pick_hall_channel': 'Выберите канал для зала славы: `/setup start`',
    'action.pick_public_post_channel': 'Выберите канал для публичных постов: `/setup start`',
    'action.pick_anon_inbox_mod_role':
      'Выберите inbox для анонима и роль модератора: `/setup start`',
    'action.none': 'Все обязательные настройки заполнены.',
  },
  en: {
    'status.title': 'Admin Status',
    'section.features': 'Features',
    'section.schedules': 'Schedules',
    'section.config': 'Configuration',
    'section.permissions': 'Permissions',
    'section.next_actions': 'Next actions',

    'feature.horoscope': 'Horoscope',
    'feature.anon': 'Anonymous questions',
    'feature.raid': 'Server raid',
    'feature.checkin': 'Weekly check-in',
    'feature.hall': 'Hall of fame',
    'feature.public_post': 'Public posts',

    'reason.disabled_by_admin': 'disabled by admin',
    'reason.enabled_not_configured': 'enabled, but not configured ({details})',
    'reason.configured': 'configured',
    'reason.channel_not_selected': 'channel is not selected',
    'reason.anon_mod_role_not_selected': 'moderator role is not selected',
    'reason.permissions_missing': 'missing permissions ({missing})',
    'reason.schedule_feature_disabled_skip': 'feature is disabled - jobs will be skipped',

    'schedule.enabled': 'enabled',
    'schedule.disabled': 'disabled',

    'value.not_set': 'not set',
    'value.ok': 'ok',

    'action.enable_all_features': 'Enable all server features: `/admin feature enable-all`',
    'action.pick_pair_category': 'Pick pair category: `/setup start`',
    'action.pick_horoscope_channel': 'Pick horoscope channel: `/setup start`',
    'action.pick_raid_channel': 'Pick raid channel: `/setup start`',
    'action.pick_hall_channel': 'Pick hall channel: `/setup start`',
    'action.pick_public_post_channel': 'Pick public post channel: `/setup start`',
    'action.pick_anon_inbox_mod_role': 'Pick anon inbox and moderator role: `/setup start`',
    'action.none': 'All required settings are filled.',
  },
} as const;

export type AdminTranslationKey = keyof (typeof dictionary)['ru'];
type TranslatorParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslatorParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function resolveAdminLocale(locale: GuildLocale | null | undefined): GuildLocale {
  return locale === 'en' ? 'en' : 'ru';
}

export function createAdminTranslator(locale: GuildLocale | null | undefined): {
  locale: GuildLocale;
  t: (key: AdminTranslationKey, params?: TranslatorParams) => string;
} {
  const normalizedLocale = resolveAdminLocale(locale);
  const selected = dictionary[normalizedLocale];
  const fallback = dictionary.ru;

  return {
    locale: normalizedLocale,
    t(key, params) {
      const template = selected[key] ?? fallback[key];
      return interpolate(template, params);
    },
  };
}
