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

export function renderWeeklyOraclePost(params: {
  guildId: string;
  weekStartDate: string;
}): ComponentsV2Message {
  const claimId = encodeCustomId({
    feature: 'oracle',
    action: 'claim_open',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
    },
  });

  const aboutId = encodeCustomId({
    feature: 'oracle',
    action: 'about',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
    },
  });

  const ritualId = encodeCustomId({
    feature: 'oracle',
    action: 'start_pair_ritual',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
    },
  });

  return {
    components: [
      uiCard({
        title: 'Оракул недели',
        status: `Неделя с ${params.weekStartDate}`,
        accentColor: 0x74512d,
        components: [
          textBlock('Это не астрология. Это практичная подсказка-навык на эту неделю.'),
          separator(),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: claimId,
              label: 'Получить подсказку',
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: aboutId,
              label: 'Что это?',
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: ritualId,
              label: 'Ритуал пары',
            },
          ]),
        ],
      }),
    ],
  };
}
