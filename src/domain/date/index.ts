import { createHash } from 'node:crypto';
import { DATE_IDEA_CARDS_COUNT } from '../../config/constants';

export const dateEnergyValues = ['low', 'medium', 'high'] as const;
export const dateBudgetValues = ['free', 'moderate', 'splurge'] as const;
export const dateTimeValues = ['quick', 'evening', 'halfday'] as const;

export type DateEnergy = (typeof dateEnergyValues)[number];
export type DateBudget = (typeof dateBudgetValues)[number];
export type DateTimeWindow = (typeof dateTimeValues)[number];

export type DateFilters = {
  energy: DateEnergy;
  budget: DateBudget;
  timeWindow: DateTimeWindow;
};

export type DateIdea = {
  key: string;
  title: string;
  steps: [string, string, string];
  starterPhrase: string;
  planB: string;
};

type DateIdeaTemplate = DateIdea & {
  energy: readonly DateEnergy[] | 'any';
  budget: readonly DateBudget[] | 'any';
  timeWindow: readonly DateTimeWindow[] | 'any';
};

const dateIdeaTemplates: DateIdeaTemplate[] = [
  {
    key: 'walk_and_warm',
    title: 'Walk + Warm Drink',
    energy: ['low', 'medium'],
    budget: 'any',
    timeWindow: ['quick', 'evening'],
    steps: [
      'Set a 25-minute walk route with one quiet stop.',
      'Share one stress and one win from today.',
      'Grab tea/coffee and close with one weekend wish.'
    ],
    starterPhrase: 'Can we take a short walk and reset together?',
    planB: 'If weather fails, do the same prompt at home with warm drinks.'
  },
  {
    key: 'micro_chef_battle',
    title: 'Micro Chef Battle',
    energy: ['medium', 'high'],
    budget: ['free', 'moderate'],
    timeWindow: ['quick', 'evening'],
    steps: [
      'Pick 3 ingredients each from what you already have.',
      'Cook two tiny plates in 30 minutes.',
      'Taste and award one playful title to each dish.'
    ],
    starterPhrase: 'Want a 30-minute playful cooking challenge?',
    planB: 'Order simple food and keep the tasting + title game.'
  },
  {
    key: 'question_box_night',
    title: 'Question Box Night',
    energy: ['low', 'medium'],
    budget: 'any',
    timeWindow: ['quick', 'evening'],
    steps: [
      'Write 5 curiosity questions each on paper.',
      'Alternate drawing questions for 20 minutes.',
      'End with one concrete thing to do for each other this week.'
    ],
    starterPhrase: 'I want a small check-in date tonight. Up for a question game?',
    planB: 'Use voice notes if you are not in the same place.'
  },
  {
    key: 'photo_story_route',
    title: 'Photo Story Route',
    energy: ['medium', 'high'],
    budget: ['free', 'moderate'],
    timeWindow: ['evening', 'halfday'],
    steps: [
      'Pick a neighborhood or park and 4 photo prompts.',
      'Take one photo per prompt and tell the story behind it.',
      'Choose a favorite and set it as a shared lock-screen for the week.'
    ],
    starterPhrase: 'Let’s do a mini photo-story date and keep one memory.',
    planB: 'Run the same prompts at home with old photos.'
  },
  {
    key: 'cozy_budget_reset',
    title: 'Cozy Budget Reset',
    energy: ['low'],
    budget: ['free', 'moderate'],
    timeWindow: ['quick', 'evening'],
    steps: [
      'Set a 20-minute timer and list upcoming weekend costs.',
      'Pick one fun, low-cost treat you both want.',
      'Book the time slot right away in calendar.'
    ],
    starterPhrase: 'Can we do a calm money check-in and still pick one fun thing?',
    planB: 'Skip numbers and only decide one shared low-cost activity.'
  },
  {
    key: 'new_place_hour',
    title: 'One New Place Hour',
    energy: ['medium', 'high'],
    budget: ['moderate', 'splurge'],
    timeWindow: ['evening', 'halfday'],
    steps: [
      'Pick one place neither of you has tried.',
      'Share one expectation before arriving.',
      'Rate the vibe (1-10) and decide if it becomes a repeat spot.'
    ],
    starterPhrase: 'Let’s try one new place this week and rate it together.',
    planB: 'Try a new dish from a familiar place instead.'
  },
  {
    key: 'home_spa_switch',
    title: 'Home Spa Switch',
    energy: ['low'],
    budget: ['free', 'moderate'],
    timeWindow: ['evening'],
    steps: [
      'Set phones away for 40 minutes.',
      'Each gives the other one comfort ritual (tea, massage, music).',
      'Close with one sentence: “This helped me because…”'
    ],
    starterPhrase: 'I’d love a calm home reset night with no phones.',
    planB: 'Shorten to 20 minutes and keep only tea + music.'
  },
  {
    key: 'city_side_quest',
    title: 'City Side Quest',
    energy: ['high'],
    budget: ['free', 'moderate', 'splurge'],
    timeWindow: ['halfday'],
    steps: [
      'Pick 3 mini-missions (new snack, random bookstore, surprise photo).',
      'Complete missions in any order with a 2-hour cap.',
      'End with a debrief: best moment and one do-over.'
    ],
    starterPhrase: 'Want to run a half-day side quest together?',
    planB: 'Do a neighborhood version with only one mission.'
  },
  {
    key: 'museum_then_talk',
    title: 'Museum + Talk',
    energy: ['medium'],
    budget: ['moderate', 'splurge'],
    timeWindow: ['halfday'],
    steps: [
      'Pick one exhibit or gallery room each.',
      'Explain why you picked it in under 60 seconds.',
      'Have a 20-minute cafe chat with one future plan.'
    ],
    starterPhrase: 'How about a slow museum date and one future-planning chat?',
    planB: 'Watch a virtual tour at home and keep the same prompts.'
  },
  {
    key: 'sunrise_reset',
    title: 'Sunrise Reset',
    energy: ['low', 'medium'],
    budget: ['free'],
    timeWindow: ['halfday'],
    steps: [
      'Meet early for sunrise and no phones for 15 minutes.',
      'Each names one thing to release and one to focus on.',
      'Grab breakfast and set one shared priority for next week.'
    ],
    starterPhrase: 'Can we do a quiet sunrise reset this weekend?',
    planB: 'Do a balcony/window sunrise + home breakfast.'
  },
  {
    key: 'taste_map',
    title: 'Taste Map Date',
    energy: ['medium'],
    budget: ['moderate', 'splurge'],
    timeWindow: ['evening', 'halfday'],
    steps: [
      'Pick 2-3 small food stops in one area.',
      'At each stop, each person chooses for the other.',
      'Vote for winner and schedule a rematch.'
    ],
    starterPhrase: 'Let’s make an evening taste map and pick a winner.',
    planB: 'Do one stop only and add dessert at home.'
  }
];

export function parseDateEnergy(value: string): DateEnergy | null {
  return dateEnergyValues.includes(value as DateEnergy) ? (value as DateEnergy) : null;
}

export function parseDateBudget(value: string): DateBudget | null {
  return dateBudgetValues.includes(value as DateBudget) ? (value as DateBudget) : null;
}

export function parseDateTimeWindow(value: string): DateTimeWindow | null {
  return dateTimeValues.includes(value as DateTimeWindow) ? (value as DateTimeWindow) : null;
}

function hashNumber(value: string): number {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0);
}

function matches<T extends string>(rule: readonly T[] | 'any', value: T): boolean {
  return rule === 'any' || rule.includes(value);
}

export function generateDateIdeas(filters: DateFilters): DateIdea[] {
  const matched = dateIdeaTemplates.filter(
    (idea) =>
      matches(idea.energy, filters.energy)
      && matches(idea.budget, filters.budget)
      && matches(idea.timeWindow, filters.timeWindow),
  );

  const pool = matched.length >= DATE_IDEA_CARDS_COUNT ? matched : dateIdeaTemplates;

  return [...pool]
    .sort((left, right) => {
      const leftHash = hashNumber(
        `${filters.energy}:${filters.budget}:${filters.timeWindow}:${left.key}`,
      );
      const rightHash = hashNumber(
        `${filters.energy}:${filters.budget}:${filters.timeWindow}:${right.key}`,
      );

      if (leftHash !== rightHash) {
        return leftHash - rightHash;
      }

      return left.key.localeCompare(right.key);
    })
    .slice(0, DATE_IDEA_CARDS_COUNT)
    .map((idea) => ({
      key: idea.key,
      title: idea.title,
      steps: idea.steps,
      starterPhrase: idea.starterPhrase,
      planB: idea.planB
    }));
}

export function formatDateFilters(filters: DateFilters): string {
  return `energy=${filters.energy}, budget=${filters.budget}, time=${filters.timeWindow}`;
}
