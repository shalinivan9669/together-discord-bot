import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import { encodeCustomId } from '../interactions/customId';

export function renderWeeklyHoroscopePost(params: {
  guildId: string;
  weekStartDate: string;
}): ComponentsV2Message {
  const claimId = encodeCustomId({
    feature: 'horoscope',
    action: 'claim_open',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  const aboutId = encodeCustomId({
    feature: 'horoscope',
    action: 'about',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  const ritualId = encodeCustomId({
    feature: 'horoscope',
    action: 'start_pair_ritual',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  return {
    components: [
      uiCard({
        title: 'Weekly Horoscope',
        status: `Week ${params.weekStartDate}`,
        accentColor: 0x74512d,
        components: [
          textBlock(
            'Your shared pattern for this week is ready.\nGet your private guidance in one tap.\nPair ritual prompts are designed for a calm 10-minute check-in.',
          ),
          separator(),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: claimId,
              label: 'Get privately'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: aboutId,
              label: 'About'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: ritualId,
              label: 'Start pair ritual'
            }
          ])
        ]
      })
    ]
  };
}
