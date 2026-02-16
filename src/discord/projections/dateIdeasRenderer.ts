import type { DateFilters, DateIdea } from '../../domain/date';
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
    `Starter phrase: “${idea.starterPhrase}”`,
    `Plan B: ${idea.planB}`
  ].join('\n');
}

export function renderDateIdeasResult(input: {
  filters: DateFilters;
  ideas: DateIdea[];
}): ComponentsV2Message {
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
        title: 'Date Generator',
        status: `${input.filters.energy} energy • ${input.filters.budget} budget • ${input.filters.timeWindow} time`,
        accentColor: 0x6d4c41,
        components: [
          textBlock('Here are 3 deterministic date plans. Pick one and run it this weekend.'),
          separator()
        ]
      }),
      ...input.ideas.slice(0, 3).map((idea, index) =>
        uiCard({
          title: idea.title,
          status: `Idea ${index + 1}`,
          accentColor: ideasAccent(index),
          components: [textBlock(ideaBody(idea))]
        })
      ),
      actionRowButtons([
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          custom_id: saveId,
          label: 'Save for weekend'
        }
      ])
    ]
  };
}
