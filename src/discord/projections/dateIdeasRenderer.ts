import type { DateFilters, DateIdea } from '../../domain/date';
import { t, type AppLocale } from '../../i18n';
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

function ideasAccent(index: number): number {
  if (index === 0) {
    return 0x3a7d44;
  }

  if (index === 1) {
    return 0x2f6f9f;
  }

  return 0xb86a2f;
}

function ideaBody(idea: DateIdea): string {
  return [
    `1. ${idea.steps[0]}`,
    `2. ${idea.steps[1]}`,
    `3. ${idea.steps[2]}`,
    '',
    `Фраза для старта: «${idea.starterPhrase}»`,
    `План Б: ${idea.planB}`
  ].join('\n');
}

export function renderDateIdeasResult(input: {
  filters: DateFilters;
  ideas: DateIdea[];
  locale?: AppLocale;
}): ComponentsV2Message {
  const locale = input.locale ?? 'ru';
  const saveId = encodeCustomId({
    feature: 'date',
    action: 'save_weekend',
    payload: {
      e: input.filters.energy,
      b: input.filters.budget,
      t: input.filters.timeWindow
    }
  });

  return {
    components: [
      uiCard({
        title: locale === 'ru' ? 'Генератор свиданий' : 'Date Generator',
        status: [
          `${t(locale, `date.energy.${input.filters.energy}` as const)} ${locale === 'ru' ? 'энергия' : 'energy'}`,
          `${t(locale, `date.budget.${input.filters.budget}` as const)} ${locale === 'ru' ? 'бюджет' : 'budget'}`,
          `${t(locale, `date.time.${input.filters.timeWindow}` as const)} ${locale === 'ru' ? 'время' : 'time'}`
        ].join(' • '),
        accentColor: 0x6d4c41,
        components: [
          textBlock(locale === 'ru'
            ? 'Ниже 3 детерминированных плана свидания. Выберите один и попробуйте на этих выходных.'
            : 'Here are 3 deterministic date plans. Pick one and run it this weekend.'),
          separator()
        ]
      }),
      ...input.ideas.slice(0, 3).map((idea, index) =>
        uiCard({
          title: idea.title,
          status: locale === 'ru' ? `Идея ${index + 1}` : `Idea ${index + 1}`,
          accentColor: ideasAccent(index),
          components: [textBlock(ideaBody(idea))]
        })
      ),
      actionRowButtons([
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          custom_id: saveId,
          label: locale === 'ru' ? 'Сохранить на выходные' : 'Save for weekend'
        }
      ])
    ]
  };
}
