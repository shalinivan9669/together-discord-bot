import { randomUUID } from 'node:crypto';
import { db } from '../src/infra/db/drizzle';
import {
  agreementsLibrary,
  contentHoroscopeArchetypes,
  raidQuests
} from '../src/infra/db/schema';

const archetypes = [
  'anchor',
  'spark',
  'mirror',
  'bridge',
  'lantern',
  'compass',
  'harbor',
  'signal',
  'forge',
  'garden',
  'pulse',
  'horizon'
].map((key) => ({
  key,
  title: key[0]!.toUpperCase() + key.slice(1),
  variantsJson: {
    soft: {
      conflict: {
        risk: 'Avoiding the hard sentence',
        step: 'Name one feeling and one need in 10 minutes',
        keyPhrase: 'We can be on the same side.',
        taboo: 'Do not stack old arguments',
        miniChallenge: 'Send one appreciative sentence today.'
      },
      ok: {
        risk: 'Running on autopilot',
        step: 'Take a 10-minute no-phone tea walk',
        keyPhrase: 'Small rituals keep us close.',
        taboo: 'No multitasking while checking in',
        miniChallenge: 'Share one tiny gratitude.'
      },
      boredom: {
        risk: 'Comfort without novelty',
        step: 'Try one new micro-date tonight',
        keyPhrase: 'Curiosity is intimacy fuel.',
        taboo: 'No doomscrolling side-by-side',
        miniChallenge: 'Ask one surprising question.'
      },
      distance: {
        risk: 'Assuming intent from silence',
        step: 'Schedule a 10-minute reconnect call',
        keyPhrase: 'Clarify before concluding.',
        taboo: 'No passive-aggressive texting',
        miniChallenge: 'Send one warm voice note.'
      },
      fatigue: {
        risk: 'Snapping under stress',
        step: 'Pick one task to drop this week',
        keyPhrase: 'Energy management is care.',
        taboo: 'No score-keeping during burnout',
        miniChallenge: 'Ask, what would lighten your load?' 
      },
      jealousy: {
        risk: 'Hidden reassurance needs',
        step: 'State one boundary and one reassurance request',
        keyPhrase: 'Boundaries and trust can coexist.',
        taboo: 'No vague accusations',
        miniChallenge: 'Agree on one transparent habit.'
      }
    },
    neutral: {
      conflict: {
        risk: 'Escalation loops',
        step: 'Use a 2-minute pause rule before replying',
        keyPhrase: 'Pause, then repair.',
        taboo: 'No sarcasm during repair',
        miniChallenge: 'Close with one clear ask.'
      },
      ok: {
        risk: 'Drifting priorities',
        step: 'Align top 2 priorities this week',
        keyPhrase: 'Alignment beats assumptions.',
        taboo: 'No yes-by-default scheduling',
        miniChallenge: 'Decline one low-value commitment.'
      },
      boredom: {
        risk: 'Predictable patterns',
        step: 'Swap roles in one daily routine',
        keyPhrase: 'Novelty can be tiny and frequent.',
        taboo: 'No all-or-nothing plans',
        miniChallenge: 'Pick one playful prompt.'
      },
      distance: {
        risk: 'Delayed repair',
        step: 'Set one same-day conflict timeout',
        keyPhrase: 'Distance shrinks with structure.',
        taboo: 'No ghosting after tension',
        miniChallenge: 'Share one check-in window.'
      },
      fatigue: {
        risk: 'Low empathy bandwidth',
        step: 'Switch to low-friction support mode',
        keyPhrase: 'Support can be simple.',
        taboo: 'No heavy decisions while depleted',
        miniChallenge: 'Create a one-word energy signal.'
      },
      jealousy: {
        risk: 'Story-making without data',
        step: 'Ask one clarifying question before reacting',
        keyPhrase: 'Curiosity interrupts fear.',
        taboo: 'No testing behavior',
        miniChallenge: 'Define one shared boundary.'
      }
    },
    hard: {
      conflict: {
        risk: 'Winning over understanding',
        step: 'Run a 10-minute repair script now',
        keyPhrase: 'Repair is leadership.',
        taboo: 'No character attacks',
        miniChallenge: 'Each name one ownership point.'
      },
      ok: {
        risk: 'Silent resentment accrual',
        step: 'Surface one unspoken friction today',
        keyPhrase: 'Directness prevents debt.',
        taboo: 'No hinting games',
        miniChallenge: 'Agree one concrete adjustment.'
      },
      boredom: {
        risk: 'Relationship entropy',
        step: 'Commit to one non-negotiable novelty block',
        keyPhrase: 'Intimacy requires maintenance.',
        taboo: 'No postponing indefinitely',
        miniChallenge: 'Book a date before sleep.'
      },
      distance: {
        risk: 'Parallel lives',
        step: 'Define minimum contact contract for 7 days',
        keyPhrase: 'Consistency restores trust.',
        taboo: 'No mixed signals',
        miniChallenge: 'Set daily 10-minute anchor.'
      },
      fatigue: {
        risk: 'Care collapse',
        step: 'Create a recovery-first week plan',
        keyPhrase: 'Rest is relational work.',
        taboo: 'No martyr routines',
        miniChallenge: 'Cancel one optional task.'
      },
      jealousy: {
        risk: 'Control disguised as care',
        step: 'Convert fear statement into boundary request',
        keyPhrase: 'State needs, not control.',
        taboo: 'No surveillance behavior',
        miniChallenge: 'Draft one respectful boundary line.'
      }
    }
  }
}));

const agreements = [
  'We pause heated chats after 11 PM.',
  'We ask before assuming tone.',
  'We do one 10-minute check-in daily.',
  'We avoid phones during meals together.',
  'We repair same-day after conflict when possible.',
  'We state one appreciation before critique.',
  'We define one shared plan each Sunday.',
  'We ask directly for reassurance.',
  'We protect one no-drama evening weekly.',
  'We use kind language under stress.'
].map((text, index) => ({
  key: `agreement_${index + 1}`,
  text,
  tagsJson: ['baseline', 'weekly']
}));

const questTemplates = [
  { key: 'micro_repair', category: 'repair', difficulty: 'micro', points: 10, text: 'Use a 2-minute pause and restart calmly.' },
  { key: 'micro_gratitude', category: 'connection', difficulty: 'micro', points: 8, text: 'Exchange one specific gratitude.' },
  { key: 'micro_walk', category: 'connection', difficulty: 'micro', points: 10, text: 'Take a 10-minute walk together.' },
  { key: 'micro_no_phone', category: 'focus', difficulty: 'micro', points: 8, text: 'Do a 20-minute no-phone conversation.' },
  { key: 'micro_boundary', category: 'boundary', difficulty: 'micro', points: 12, text: 'Set one clear boundary kindly.' },
  { key: 'micro_support', category: 'support', difficulty: 'micro', points: 10, text: 'Ask and do one concrete support action.' },
  { key: 'micro_checkin', category: 'ritual', difficulty: 'micro', points: 9, text: 'Complete a 5-scale mini check-in.' },
  { key: 'micro_breath', category: 'repair', difficulty: 'micro', points: 7, text: 'Do 3 minutes of co-regulation breathing.' },
  { key: 'micro_plan', category: 'planning', difficulty: 'micro', points: 10, text: 'Align top two priorities for tomorrow.' },
  { key: 'micro_phrase', category: 'language', difficulty: 'micro', points: 8, text: 'Use your agreed key phrase in tension.' },
  { key: 'medium_date', category: 'connection', difficulty: 'medium', points: 20, text: 'Schedule and complete a 45-minute date.' },
  { key: 'medium_repair_script', category: 'repair', difficulty: 'medium', points: 24, text: 'Run a full repair script after conflict.' },
  { key: 'medium_budget_talk', category: 'planning', difficulty: 'medium', points: 18, text: 'Have a calm 20-minute money check-in.' },
  { key: 'medium_future_map', category: 'planning', difficulty: 'medium', points: 22, text: 'Map one shared 3-month goal.' },
  { key: 'medium_support_day', category: 'support', difficulty: 'medium', points: 20, text: 'Take over one stress task for partner.' },
  { key: 'medium_conflict_reset', category: 'repair', difficulty: 'medium', points: 23, text: 'Reset a recurring conflict with new rule.' },
  { key: 'medium_energy_plan', category: 'health', difficulty: 'medium', points: 19, text: 'Create a fatigue-aware weekly plan.' },
  { key: 'medium_family_call', category: 'family', difficulty: 'medium', points: 18, text: 'Coordinate one meaningful family call.' },
  { key: 'medium_values_talk', category: 'values', difficulty: 'medium', points: 21, text: 'Discuss one values mismatch respectfully.' },
  { key: 'medium_celebrate', category: 'connection', difficulty: 'medium', points: 20, text: 'Celebrate one shared win intentionally.' }
];

async function seedArchetypes() {
  for (const archetype of archetypes) {
    await db
      .insert(contentHoroscopeArchetypes)
      .values({
        key: archetype.key,
        title: archetype.title,
        variantsJson: archetype.variantsJson,
        active: true
      })
      .onConflictDoUpdate({
        target: contentHoroscopeArchetypes.key,
        set: {
          title: archetype.title,
          variantsJson: archetype.variantsJson,
          active: true
        }
      });
  }
}

async function seedAgreements() {
  for (const agreement of agreements) {
    await db
      .insert(agreementsLibrary)
      .values({
        key: agreement.key,
        text: agreement.text,
        tagsJson: agreement.tagsJson,
        active: true
      })
      .onConflictDoUpdate({
        target: agreementsLibrary.key,
        set: {
          text: agreement.text,
          tagsJson: agreement.tagsJson,
          active: true
        }
      });
  }
}

async function seedRaidQuests() {
  for (const quest of questTemplates) {
    await db
      .insert(raidQuests)
      .values({
        id: randomUUID(),
        key: quest.key,
        category: quest.category,
        difficulty: quest.difficulty,
        points: quest.points,
        text: quest.text,
        active: true
      })
      .onConflictDoUpdate({
        target: raidQuests.key,
        set: {
          category: quest.category,
          difficulty: quest.difficulty,
          points: quest.points,
          text: quest.text,
          active: true
        }
      });
  }
}

async function main() {
  await seedArchetypes();
  await seedAgreements();
  await seedRaidQuests();
  console.log('Seed completed.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });