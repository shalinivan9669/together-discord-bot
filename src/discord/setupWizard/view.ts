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

function channelLine(label: string, channelId: string | null): string {
  return `${label}: ${channelId ? `<#${channelId}>` : '_not set_'}`;
}

function categoryLine(categoryId: string | null): string {
  return `Pair rooms category: ${categoryId ? `<#${categoryId}>` : '_not set_'}`;
}

function roleLine(roleId: string | null): string {
  return `Anon moderator role: ${roleId ? `<@&${roleId}>` : '_not set_'}`;
}

function timezoneLine(timezone: string): string {
  return `Timezone: \`${timezone}\``;
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

function timezoneSelect(current: string) {
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
      placeholder: 'Select timezone',
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

export function renderSetupWizardPanel(draft: SetupWizardDraft): ComponentsV2Message {
  const summary = [
    'Step 1: select pair category and channels.',
    'Step 2: select optional anon moderator role and timezone.',
    'Step 3: press Complete setup.',
    '',
    categoryLine(draft.pairCategoryId),
    channelLine('Weekly horoscope', draft.horoscopeChannelId),
    channelLine('Raid progress', draft.raidChannelId),
    channelLine('Monthly hall', draft.hallChannelId),
    channelLine('Public posts', draft.publicPostChannelId),
    channelLine('Anon inbox', draft.anonInboxChannelId),
    roleLine(draft.anonModRoleId),
    timezoneLine(draft.timezone),
  ].join('\n');

  return {
    components: [
      uiCard({
        title: 'Setup Wizard',
        status: draft.guildId,
        accentColor: 0x3d5a80,
        components: [
          textBlock(summary),
          categorySelect('pick_pair_category', 'Select pair rooms category'),
          channelSelect('pick_horoscope_channel', 'Select weekly horoscope channel'),
          channelSelect('pick_raid_channel', 'Select raid progress channel'),
          channelSelect('pick_hall_channel', 'Select monthly hall channel'),
          channelSelect('pick_public_post_channel', 'Select public post channel'),
          channelSelect('pick_anon_inbox_channel', 'Select anon inbox channel'),
          actionRowSelects([
            {
              type: ComponentType.RoleSelect,
              custom_id: setupCustomId('pick_mod_role'),
              placeholder: 'Select optional moderator role',
              min_values: 0,
              max_values: 1,
            }
          ]),
          timezoneSelect(draft.timezone),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: setupCustomId('complete'),
              label: 'Complete Setup'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: setupCustomId('reset'),
              label: 'Reset'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: setupCustomId('test_post'),
              label: 'Test Post'
            }
          ])
        ]
      })
    ]
  };
}
