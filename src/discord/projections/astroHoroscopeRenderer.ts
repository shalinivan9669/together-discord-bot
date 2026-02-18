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
import { ASTRO_PUBLIC_DISCLAIMER } from '../../app/services/astroHoroscopeService';

export function renderAstroHoroscopeCard(input: {
  cycleStartDate: string;
  cycleEndDate: string;
  skyTheme: string;
  aboutLine: string;
  isTest?: boolean;
}): ComponentsV2Message {
  const claimId = encodeCustomId({
    feature: 'astro',
    action: 'claim_open',
    payload: {
      c: input.cycleStartDate
    }
  });

  const pairId = encodeCustomId({
    feature: 'astro',
    action: 'pair_open',
    payload: {
      c: input.cycleStartDate
    }
  });

  const aboutId = encodeCustomId({
    feature: 'astro',
    action: 'about',
    payload: {
      c: input.cycleStartDate
    }
  });

  const signId = encodeCustomId({
    feature: 'astro',
    action: 'sign_open',
    payload: {
      c: input.cycleStartDate
    }
  });

  return {
    components: [
      uiCard({
        title: input.isTest ? 'Гороскоп на 6 дней [TEST]' : 'Гороскоп на 6 дней',
        status: `${input.cycleStartDate} → ${input.cycleEndDate}`,
        accentColor: 0x2d4c8f,
        components: [
          textBlock(`Небесный фон: ${input.skyTheme}`),
          textBlock(input.aboutLine),
          textBlock(ASTRO_PUBLIC_DISCLAIMER),
          separator(),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: claimId,
              label: 'Получить приватно',
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: pairId,
              label: 'Для пары',
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: aboutId,
              label: 'About',
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: signId,
              label: 'Настроить знак',
            },
          ]),
        ],
      }),
    ],
  };
}
