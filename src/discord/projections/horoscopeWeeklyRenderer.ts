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
        title: 'Недельный гороскоп',
        status: `Неделя ${params.weekStartDate}`,
        accentColor: 0x74512d,
        components: [
          textBlock(
            'Ваш общий паттерн на эту неделю готов.\nПолучите персональную подсказку в один тап.\nРитуал для пары рассчитан на спокойный 10-минутный чек-ин.',
          ),
          separator(),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: claimId,
              label: 'Получить в личку'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: aboutId,
              label: 'О фиче'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: ritualId,
              label: 'Начать ритуал пары'
            }
          ])
        ]
      })
    ]
  };
}
