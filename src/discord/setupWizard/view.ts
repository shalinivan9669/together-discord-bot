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

function roleLine(roleId: string | null): string {
  return `Moderator role: ${roleId ? `<@&${roleId}>` : '_not set_'}`;
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

export function renderSetupWizardPanel(draft: SetupWizardDraft): ComponentsV2Message {
  const summary = [
    'Pick channels and role below, then press Save.',
    '',
    channelLine('Duel scoreboard', draft.duelPublicChannelId),
    channelLine('Weekly horoscope', draft.horoscopeChannelId),
    channelLine('Questions inbox', draft.questionsChannelId),
    channelLine('Raid progress', draft.raidChannelId),
    channelLine('Monthly hall', draft.hallChannelId),
    roleLine(draft.moderatorRoleId),
  ].join('\n');

  return {
    components: [
      uiCard({
        title: 'Setup Wizard',
        status: draft.guildId,
        accentColor: 0x3d5a80,
        components: [
          textBlock(summary),
          channelSelect('pick_duel_channel', 'Select duel scoreboard channel'),
          channelSelect('pick_horoscope_channel', 'Select weekly horoscope channel'),
          channelSelect('pick_questions_channel', 'Select questions channel'),
          channelSelect('pick_raid_channel', 'Select raid progress channel'),
          channelSelect('pick_hall_channel', 'Select monthly hall channel'),
          actionRowSelects([
            {
              type: ComponentType.RoleSelect,
              custom_id: setupCustomId('pick_mod_role'),
              placeholder: 'Select optional moderator role',
              min_values: 0,
              max_values: 1,
            }
          ]),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: setupCustomId('save'),
              label: 'Save'
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
