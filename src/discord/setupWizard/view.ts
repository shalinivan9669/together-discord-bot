import {
  actionRowButtons,
  actionRowSelects,
  ButtonStyle,
  ChannelType,
  ComponentType,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';

import { encodeCustomId } from '../interactions/customId';
import { getSetupMissingRequirementKeys } from '../../app/services/configRequirements';
import { formatRequirementLabel } from '../featureErrors';
import type { SetupWizardDraft } from './state';
import { t, type AppLocale } from '../../i18n';
import { setupWizardTimezones } from './timezones';

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

function setupCustomId(action: string, userId: string): string {
  return encodeCustomId({
    feature: 'setup_wizard',
    action,
    payload: { u: userId }
  });
}

function channelSelect(action: string, placeholder: string, userId: string) {
  return actionRowSelects([
    {
      type: ComponentType.ChannelSelect,
      custom_id: setupCustomId(action, userId),
      placeholder,
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
    }
  ]);
}

function categorySelect(action: string, placeholder: string, userId: string) {
  return actionRowSelects([
    {
      type: ComponentType.ChannelSelect,
      custom_id: setupCustomId(action, userId),
      placeholder,
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildCategory]
    }
  ]);
}

function timezoneSelect(locale: AppLocale, current: string, userId: string) {
  return actionRowSelects([
    {
      type: ComponentType.StringSelect,
      custom_id: setupCustomId('pick_timezone', userId),
      placeholder: t(locale, 'setup.wizard.placeholder.timezone'),
      min_values: 1,
      max_values: 1,
      options: setupWizardTimezones.map((timezone) => ({
        label: timezone,
        value: timezone,
        default: timezone === current
      }))
    }
  ]);
}

export type SetupWizardPanelMode = 'draft' | 'completed';

function statusLine(
  locale: AppLocale,
  mode: SetupWizardPanelMode,
  missingCount: number,
): string {
  if (mode === 'completed') {
    return t(locale, 'setup.wizard.status.completed');
  }

  return missingCount === 0
    ? t(locale, 'setup.wizard.status.ready')
    : t(locale, 'setup.wizard.status.incomplete', { count: missingCount });
}

export function renderSetupWizardPanel(
  draft: SetupWizardDraft,
  locale: AppLocale,
  options?: {
    mode?: SetupWizardPanelMode;
  },
): ComponentsV2Message {
  const missingKeys = getSetupMissingRequirementKeys(draft);
  const missingLabels = missingKeys.map((key) => formatRequirementLabel(locale, key));
  const mode = options?.mode ?? 'draft';

  const summaryLines = [
    t(locale, 'setup.wizard.step1'),
    t(locale, 'setup.wizard.step2'),
    t(locale, 'setup.wizard.step3'),
    '',
    `${t(locale, 'setup.wizard.line.status')}: ${statusLine(locale, mode, missingKeys.length)}`,
    missingKeys.length === 0
      ? t(locale, 'setup.wizard.line.missing.none')
      : t(locale, 'setup.wizard.line.missing.some', {
          missing: missingLabels.join(', ')
        }),
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
  ];

  const summary = summaryLines.join('\n');

  return {
    content: summary,
    components: [
      uiCard({
        title: t(locale, 'setup.wizard.title'),
        status: statusLine(locale, mode, missingKeys.length),
        accentColor: 0x3d5a80,
        components: [
          categorySelect('pick_pair_category', t(locale, 'setup.wizard.placeholder.pair_category'), draft.userId),
          channelSelect('pick_horoscope_channel', t(locale, 'setup.wizard.placeholder.horoscope_channel'), draft.userId),
          channelSelect('pick_raid_channel', t(locale, 'setup.wizard.placeholder.raid_channel'), draft.userId),
          channelSelect('pick_hall_channel', t(locale, 'setup.wizard.placeholder.hall_channel'), draft.userId),
          channelSelect(
            'pick_public_post_channel',
            t(locale, 'setup.wizard.placeholder.public_post_channel'),
            draft.userId,
          ),
          channelSelect(
            'pick_anon_inbox_channel',
            t(locale, 'setup.wizard.placeholder.anon_inbox_channel'),
            draft.userId,
          ),
          actionRowSelects([
            {
              type: ComponentType.RoleSelect,
              custom_id: setupCustomId('pick_mod_role', draft.userId),
              placeholder: t(locale, 'setup.wizard.placeholder.mod_role'),
              min_values: 0,
              max_values: 1,
            }
          ]),
          timezoneSelect(locale, draft.timezone, draft.userId),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: setupCustomId('complete', draft.userId),
              label: t(locale, 'setup.wizard.button.complete'),
              disabled: missingKeys.length > 0
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: setupCustomId('reset', draft.userId),
              label: t(locale, 'setup.wizard.button.reset')
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: setupCustomId('test_post', draft.userId),
              label: t(locale, 'setup.wizard.button.test_post')
            }
          ])
        ]
      })
    ]
  };
}
