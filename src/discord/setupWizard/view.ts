import {
  actionRowButtons,
  actionRowSelects,
  ButtonStyle,
  ChannelType,
  ComponentType,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';

import { encodeCustomId } from '../interactions/customId';
import type { SetupWizardDraft } from './state';
import { t, type AppLocale } from '../../i18n';

function channelLine(locale: AppLocale, label: string, channelId: string | null): string {
  return `${label}: ${channelId ? `<#${channelId}>` : `_${t(locale, 'common.not_set')}_`}`;
}

function categoryLine(locale: AppLocale, categoryId: string | null): string {
  return `${t(locale, 'setup.wizard.line.pair_category')}: ${categoryId ? `<#${categoryId}>` : `_${t(locale, 'common.not_set')}_`}`;
}

function roleLine(locale: AppLocale, roleId: string | null): string {
  return `${t(locale, 'setup.wizard.line.anon_mod_role')}: ${roleId ? `<@&${roleId}>` : `_${t(locale, 'common.not_set')}_`}`;
}

function timezoneLine(locale: AppLocale, timezone: string): string {
  return `${t(locale, 'setup.wizard.line.timezone')}: \`${timezone}\``;
}

function localeLine(locale: AppLocale): string {
  return `${t(locale, 'setup.wizard.line.locale')}: \`${locale}\``;
}

function setupCustomId(action: string): string {
  return encodeCustomId({
    feature: 'setup_wizard',
    action,
    payload: {}
  });
}

function channelSelect(action: string, placeholder: string) {
  return actionRowSelects([
    {
      type: ComponentType.ChannelSelect,
      custom_id: setupCustomId(action),
      placeholder,
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
    }
  ]);
}

function categorySelect(action: string, placeholder: string) {
  return actionRowSelects([
    {
      type: ComponentType.ChannelSelect,
      custom_id: setupCustomId(action),
      placeholder,
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildCategory]
    }
  ]);
}

function timezoneSelect(locale: AppLocale, current: string) {
  const options = [
    'Asia/Almaty',
    'UTC',
    'Europe/Moscow',
    'Europe/Berlin',
    'Asia/Dubai',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles'
  ];

  return actionRowSelects([
    {
      type: ComponentType.StringSelect,
      custom_id: setupCustomId('pick_timezone'),
      placeholder: t(locale, 'setup.wizard.placeholder.timezone'),
      min_values: 1,
      max_values: 1,
      options: options.map((timezone) => ({
        label: timezone,
        value: timezone,
        default: timezone === current
      }))
    }
  ]);
}

export function renderSetupWizardPanel(draft: SetupWizardDraft, locale: AppLocale): ComponentsV2Message {
  const summary = [
    t(locale, 'setup.wizard.step1'),
    t(locale, 'setup.wizard.step2'),
    t(locale, 'setup.wizard.step3'),
    '',
    categoryLine(locale, draft.pairCategoryId),
    channelLine(locale, t(locale, 'setup.wizard.line.horoscope_channel'), draft.horoscopeChannelId),
    channelLine(locale, t(locale, 'setup.wizard.line.raid_channel'), draft.raidChannelId),
    channelLine(locale, t(locale, 'setup.wizard.line.hall_channel'), draft.hallChannelId),
    channelLine(locale, t(locale, 'setup.wizard.line.public_post_channel'), draft.publicPostChannelId),
    channelLine(locale, t(locale, 'setup.wizard.line.anon_inbox_channel'), draft.anonInboxChannelId),
    roleLine(locale, draft.anonModRoleId),
    timezoneLine(locale, draft.timezone),
    localeLine(locale),
  ].join('\n');

  return {
    components: [
      uiCard({
        title: t(locale, 'setup.wizard.title'),
        status: draft.guildId,
        accentColor: 0x3d5a80,
        components: [
          textBlock(summary),
          categorySelect('pick_pair_category', t(locale, 'setup.wizard.placeholder.pair_category')),
          channelSelect('pick_horoscope_channel', t(locale, 'setup.wizard.placeholder.horoscope_channel')),
          channelSelect('pick_raid_channel', t(locale, 'setup.wizard.placeholder.raid_channel')),
          channelSelect('pick_hall_channel', t(locale, 'setup.wizard.placeholder.hall_channel')),
          channelSelect('pick_public_post_channel', t(locale, 'setup.wizard.placeholder.public_post_channel')),
          channelSelect('pick_anon_inbox_channel', t(locale, 'setup.wizard.placeholder.anon_inbox_channel')),
          actionRowSelects([
            {
              type: ComponentType.RoleSelect,
              custom_id: setupCustomId('pick_mod_role'),
              placeholder: t(locale, 'setup.wizard.placeholder.mod_role'),
              min_values: 0,
              max_values: 1,
            }
          ]),
          timezoneSelect(locale, draft.timezone),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: setupCustomId('complete'),
              label: t(locale, 'setup.wizard.button.complete')
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: setupCustomId('reset'),
              label: t(locale, 'setup.wizard.button.reset')
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: setupCustomId('test_post'),
              label: t(locale, 'setup.wizard.button.test_post')
            }
          ])
        ]
      })
    ]
  };
}
