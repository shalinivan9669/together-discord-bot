import { randomUUID, createHash } from 'node:crypto';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import type { Client } from 'discord.js';
import type PgBoss from 'pg-boss';
import {
  MEDIATOR_REPAIR_STEP_INTERVAL_MINUTES,
  MEDIATOR_REPAIR_TOTAL_MINUTES,
  MEDIATOR_SAY_MAX_LENGTH,
} from '../../config/constants';
import { t, type AppLocale } from '../../i18n';
import { db } from '../../infra/db/drizzle';
import { mediatorRepairSessions, mediatorSaySessions, pairs } from '../../infra/db/schema';
import { JobNames } from '../../infra/queue/jobs';
import { addMinutes } from '../../lib/time';
import { Routes } from '../../discord/ui-v2/api';
import { getGuildConfig } from './guildConfigService';

export const mediatorTones = ['soft', 'direct', 'short'] as const;
export type MediatorTone = (typeof mediatorTones)[number];

type RepairStep = {
  stepNumber: number;
  title: string;
  instruction: string;
};

const REPAIR_STEPS: Record<AppLocale, RepairStep[]> = {
  ru: [
    {
      stepNumber: 1,
      title: 'Пауза',
      instruction: 'Возьмите 60 секунд тишины. Без споров и оправданий. Просто выдохните и снизьте напряжение.'
    },
    {
      stepNumber: 2,
      title: 'Чувство и потребность',
      instruction: 'Каждый говорит: «Я чувствую ___ и мне нужно ___». До 20 слов.'
    },
    {
      stepNumber: 3,
      title: 'Своя часть',
      instruction: 'Каждый называет один свой вклад: «Моя часть была ___». Без «но» в этой фразе.'
    },
    {
      stepNumber: 4,
      title: 'Фиксация шага',
      instruction: 'Согласуйте один конкретный шаг на ближайшие 24 часа. Поблагодарите друг друга за разговор.'
    }
  ],
  en: [
    {
      stepNumber: 1,
      title: 'Pause',
      instruction: 'Take 60 seconds in silence. No rebuttals. Just breathe and lower intensity.'
    },
    {
      stepNumber: 2,
      title: 'Feeling and Need',
      instruction: 'Each person says: “I feel ___ and I need ___.” Keep it under 20 words.'
    },
    {
      stepNumber: 3,
      title: 'Own One Part',
      instruction: 'Each person owns one action: “My part was ___.” No “but” in this sentence.'
    },
    {
      stepNumber: 4,
      title: 'Close the Repair',
      instruction: 'Agree on one concrete next action for the next 24 hours. Thank each other for staying in the talk.'
    }
  ]
};

const SAY_TEMPLATES: Record<
  AppLocale,
  {
    soft: string[];
    direct: string[];
    short: string[];
  }
> = {
  ru: {
    soft: [
      'Мне важны наши отношения, поэтому скажу спокойно: {{base}}. Можем обсудить это пару минут?',
      'Хочу мягко поделиться: {{base}}. Давай найдём спокойный момент и поговорим.',
      'Стараюсь подобрать слова бережно: {{base}}. Ты готов(а) к короткому разговору?'
    ],
    direct: [
      '{{base}}. Мне нужно, чтобы мы обсудили это сегодня напрямую.',
      '{{base}}. Давай прямо сейчас примем одно понятное решение.',
      '{{base}}. Мне нужен чёткий ответ, чтобы мы могли двигаться дальше.'
    ],
    short: [
      '{{summary}}. Можем закрыть это сегодня?',
      '{{summary}}. Нужно быстро принять решение вместе.',
      '{{summary}}. Давай синхронизируемся по этому сейчас.'
    ]
  },
  en: {
    soft: [
      'I care about us, so I want to say this calmly: {{base}}. Can we talk for a few minutes?',
      'I want to share this gently: {{base}}. Could we find a calm moment to discuss it?',
      'I am trying to be careful with my words: {{base}}. Are you open to a short talk now?'
    ],
    direct: [
      '{{base}}. I need us to address this clearly today.',
      '{{base}}. Let’s make one clear decision on this now.',
      '{{base}}. I need a direct answer so we can move forward.'
    ],
    short: [
      '{{summary}}. Can we fix this today?',
      '{{summary}}. Need a quick decision together.',
      '{{summary}}. Can we align on this now?'
    ]
  }
};

function hashIndex(seed: string, size: number): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0) % size;
}

function cleanInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function ensureSentence(value: string): string {
  if (!value) {
    return value;
  }

  if (/[.!?]$/.test(value)) {
    return value;
  }

  return `${value}.`;
}

function truncate(value: string, maxLength: number): string {
  const chars = [...value];
  if (chars.length <= maxLength) {
    return value;
  }
  return `${chars.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

function compactSummary(value: string, wordsLimit = 12): string {
  const words = value.split(/\s+/).filter(Boolean);
  const slice = words.slice(0, wordsLimit).join(' ');
  return ensureSentence(slice);
}

function applySayTemplate(template: string, base: string, summary: string): string {
  return ensureSentence(
    template
      .replace('{{base}}', base)
      .replace('{{summary}}', summary),
  );
}

function parseTone(value: string): MediatorTone | null {
  return mediatorTones.includes(value as MediatorTone) ? (value as MediatorTone) : null;
}

function selectedToneLabel(locale: AppLocale, tone: MediatorTone): string {
  if (tone === 'soft') {
    return t(locale, 'component.mediator.say.tone.soft');
  }

  if (tone === 'direct') {
    return t(locale, 'component.mediator.say.tone.direct');
  }

  return t(locale, 'component.mediator.say.tone.short');
}

function sayTextByTone(session: typeof mediatorSaySessions.$inferSelect, tone: MediatorTone): string {
  if (tone === 'soft') {
    return session.softText;
  }

  if (tone === 'direct') {
    return session.directText;
  }

  return session.shortText;
}

export function buildMediatorSayVariants(inputText: string, locale: AppLocale = 'ru'): {
  sourceText: string;
  softText: string;
  directText: string;
  shortText: string;
} {
  const sourceText = cleanInput(inputText);
  if (sourceText.length < 2 || sourceText.length > MEDIATOR_SAY_MAX_LENGTH) {
    throw new Error(`Message length must be between 2 and ${MEDIATOR_SAY_MAX_LENGTH} characters`);
  }

  const base = ensureSentence(sourceText);
  const summary = compactSummary(sourceText);

  const templates = SAY_TEMPLATES[locale];
  const softText = truncate(
    applySayTemplate(
      templates.soft[hashIndex(`soft:${sourceText}`, templates.soft.length)] ?? templates.soft[0]!,
      base,
      summary,
    ),
    600,
  );
  const directText = truncate(
    applySayTemplate(
      templates.direct[hashIndex(`direct:${sourceText}`, templates.direct.length)] ?? templates.direct[0]!,
      base,
      summary,
    ),
    600,
  );
  const shortText = truncate(
    applySayTemplate(
      templates.short[hashIndex(`short:${sourceText}`, templates.short.length)] ?? templates.short[0]!,
      base,
      summary,
    ),
    600,
  );

  return { sourceText, softText, directText, shortText };
}

export async function createMediatorSaySession(input: {
  guildId: string;
  userId: string;
  pairId: string | null;
  sourceText: string;
  locale?: AppLocale;
}) {
  const variants = buildMediatorSayVariants(input.sourceText, input.locale ?? 'ru');
  const id = randomUUID();

  const inserted = await db
    .insert(mediatorSaySessions)
    .values({
      id,
      guildId: input.guildId,
      userId: input.userId,
      pairId: input.pairId,
      sourceText: variants.sourceText,
      softText: variants.softText,
      directText: variants.directText,
      shortText: variants.shortText,
      selectedTone: 'soft'
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error('Failed to create mediator session');
  }

  return row;
}

export async function getMediatorSaySessionForUser(input: {
  guildId: string;
  userId: string;
  sessionId: string;
}) {
  const rows = await db
    .select()
    .from(mediatorSaySessions)
    .where(
      and(
        eq(mediatorSaySessions.id, input.sessionId),
        eq(mediatorSaySessions.guildId, input.guildId),
        eq(mediatorSaySessions.userId, input.userId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function setMediatorSayTone(input: {
  guildId: string;
  userId: string;
  sessionId: string;
  tone: string;
}) {
  const tone = parseTone(input.tone);
  if (!tone) {
    throw new Error('Unsupported tone');
  }

  const updated = await db
    .update(mediatorSaySessions)
    .set({ selectedTone: tone })
    .where(
      and(
        eq(mediatorSaySessions.id, input.sessionId),
        eq(mediatorSaySessions.guildId, input.guildId),
        eq(mediatorSaySessions.userId, input.userId),
      ),
    )
    .returning();

  return updated[0] ?? null;
}

export async function markMediatorSaySentToPair(input: {
  guildId: string;
  userId: string;
  sessionId: string;
}) {
  const updated = await db
    .update(mediatorSaySessions)
    .set({ sentToPairAt: new Date() })
    .where(
      and(
        eq(mediatorSaySessions.id, input.sessionId),
        eq(mediatorSaySessions.guildId, input.guildId),
        eq(mediatorSaySessions.userId, input.userId),
        isNull(mediatorSaySessions.sentToPairAt),
      ),
    )
    .returning();

  if (updated[0]) {
    return { changed: true, session: updated[0] };
  }

  const rows = await db
    .select()
    .from(mediatorSaySessions)
    .where(
      and(
        eq(mediatorSaySessions.id, input.sessionId),
        eq(mediatorSaySessions.guildId, input.guildId),
        eq(mediatorSaySessions.userId, input.userId),
      ),
    )
    .limit(1);

  return { changed: false, session: rows[0] ?? null };
}

export function renderMediatorSayReply(
  session: typeof mediatorSaySessions.$inferSelect,
  locale: AppLocale = 'ru',
): string {
  const selectedTone = parseTone(session.selectedTone) ?? 'soft';
  const preview = sayTextByTone(session, selectedTone);

  const sentPart = session.sentToPairAt
    ? `\n\n${t(locale, 'mediator.say.reply.sent_to_pair', { when: `<t:${Math.floor(session.sentToPairAt.getTime() / 1000)}:R>` })}`
    : '';

  return [
    t(locale, 'mediator.say.reply.choose_tone'),
    '',
    `**${t(locale, 'mediator.say.reply.soft')}**: ${session.softText}`,
    '',
    `**${t(locale, 'mediator.say.reply.direct')}**: ${session.directText}`,
    '',
    `**${t(locale, 'mediator.say.reply.short')}**: ${session.shortText}`,
    '',
    t(locale, 'mediator.say.reply.preview', {
      tone: selectedToneLabel(locale, selectedTone),
      preview
    })
  ].join('\n') + sentPart;
}

export type MediatorRepairStartResult = {
  created: boolean;
  session: typeof mediatorRepairSessions.$inferSelect;
};

export function renderRepairStepText(input: {
  stepNumber: number;
  startedAt: Date;
  locale?: AppLocale;
}): string {
  const locale = input.locale ?? 'ru';
  const steps = REPAIR_STEPS[locale];
  const step = steps.find((item) => item.stepNumber === input.stepNumber);
  if (!step) {
    throw new Error('Repair step is not configured');
  }

  const nextStepNumber = input.stepNumber + 1;
  const nextUpdateAt = nextStepNumber <= steps.length
    ? addMinutes(input.startedAt, MEDIATOR_REPAIR_STEP_INTERVAL_MINUTES * (nextStepNumber - 1))
    : null;
  const flowEndsAt = addMinutes(input.startedAt, MEDIATOR_REPAIR_TOTAL_MINUTES);

  const lines = [
    t(locale, 'mediator.repair.flow_title', { minutes: MEDIATOR_REPAIR_TOTAL_MINUTES }),
    t(locale, 'mediator.repair.step', { current: step.stepNumber, total: steps.length, title: step.title }),
    step.instruction,
    '',
    t(locale, 'mediator.repair.flow_ends', { when: `<t:${Math.floor(flowEndsAt.getTime() / 1000)}:R>` })
  ];

  if (nextUpdateAt) {
    lines.push(t(locale, 'mediator.repair.next_step', { when: `<t:${Math.floor(nextUpdateAt.getTime() / 1000)}:R>` }));
  } else {
    lines.push(t(locale, 'mediator.repair.complete'));
  }

  return lines.join('\n');
}

async function getActiveRepairSession(pairId: string) {
  const rows = await db
    .select()
    .from(mediatorRepairSessions)
    .where(and(eq(mediatorRepairSessions.pairId, pairId), eq(mediatorRepairSessions.status, 'active')))
    .orderBy(desc(mediatorRepairSessions.startedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function startMediatorRepairFlow(input: {
  guildId: string;
  pairId: string;
  pairRoomChannelId: string;
  startedByUserId: string;
  boss: PgBoss;
  correlationId: string;
  interactionId?: string;
  createFlowMessage: (content: string) => Promise<string>;
  locale?: AppLocale;
  now?: Date;
}): Promise<MediatorRepairStartResult> {
  const existing = await getActiveRepairSession(input.pairId);
  if (existing) {
    return {
      created: false,
      session: existing
    };
  }

  const now = input.now ?? new Date();
  const sessionId = randomUUID();
  const locale = input.locale ?? 'ru';
  const steps = REPAIR_STEPS[locale];
  const firstMessage = renderRepairStepText({
    stepNumber: 1,
    startedAt: now,
    locale
  });
  const messageId = await input.createFlowMessage(firstMessage);

  const inserted = await db
    .insert(mediatorRepairSessions)
    .values({
      id: sessionId,
      guildId: input.guildId,
      pairId: input.pairId,
      channelId: input.pairRoomChannelId,
      messageId,
      startedByUserId: input.startedByUserId,
      status: 'active',
      currentStep: 1,
      startedAt: now
    })
    .returning();

  const session = inserted[0];
  if (!session) {
    throw new Error('Failed to persist repair session');
  }

  for (let stepNumber = 2; stepNumber <= steps.length; stepNumber += 1) {
    const startAfter = addMinutes(now, MEDIATOR_REPAIR_STEP_INTERVAL_MINUTES * (stepNumber - 1));
    await input.boss.send(
      JobNames.MediatorRepairTick,
      {
        correlationId: input.correlationId,
        interactionId: input.interactionId,
        guildId: input.guildId,
        userId: input.startedByUserId,
        feature: 'mediator',
        action: 'repair.tick',
        sessionId: session.id,
        stepNumber
      },
      {
        startAfter,
        singletonKey: `mediator-repair:${session.id}:${stepNumber}`,
        singletonSeconds: 300,
        retryLimit: 3
      },
    );
  }

  return {
    created: true,
    session
  };
}

export async function runMediatorRepairTick(input: {
  guildId: string;
  sessionId: string;
  stepNumber: number;
  client: Client;
}) {
  const config = await getGuildConfig(input.guildId);
  const steps = REPAIR_STEPS[config.locale];
  const targetStep = steps.find((step) => step.stepNumber === input.stepNumber);
  if (!targetStep) {
    return { changed: false as const, reason: 'step_not_found' as const };
  }

  const rows = await db
    .select()
    .from(mediatorRepairSessions)
    .where(
      and(
        eq(mediatorRepairSessions.id, input.sessionId),
        eq(mediatorRepairSessions.guildId, input.guildId),
        eq(mediatorRepairSessions.status, 'active'),
        lt(mediatorRepairSessions.currentStep, input.stepNumber),
      ),
    )
    .limit(1);
  const session = rows[0];
  if (!session) {
    return { changed: false as const, reason: 'session_not_active' as const };
  }

  await input.client.rest.patch(Routes.channelMessage(session.channelId, session.messageId), {
    body: {
      content: renderRepairStepText({
        stepNumber: input.stepNumber,
        startedAt: session.startedAt,
        locale: config.locale
      })
    }
  });

  const completed = input.stepNumber === steps.length;
  const updated = await db
    .update(mediatorRepairSessions)
    .set({
      currentStep: input.stepNumber,
      lastTickAt: new Date(),
      status: completed ? 'completed' : 'active',
      completedAt: completed ? new Date() : null
    })
    .where(
      and(
        eq(mediatorRepairSessions.id, session.id),
        eq(mediatorRepairSessions.status, 'active'),
        lt(mediatorRepairSessions.currentStep, input.stepNumber),
      ),
    )
    .returning();

  return {
    changed: Boolean(updated[0]),
    reason: 'ok' as const
  };
}

export async function getPairRoomForMediatorUser(input: {
  guildId: string;
  channelId: string;
  userId: string;
}) {
  const rows = await db
    .select()
    .from(pairs)
    .where(
      and(
        eq(pairs.guildId, input.guildId),
        eq(pairs.privateChannelId, input.channelId),
        eq(pairs.status, 'active'),
      ),
    )
    .limit(1);

  const pair = rows[0];
  if (!pair) {
    return null;
  }

  if (pair.user1Id !== input.userId && pair.user2Id !== input.userId) {
    return null;
  }

  return pair;
}

export function getMediatorSaySelectedText(session: typeof mediatorSaySessions.$inferSelect): string {
  const selectedTone = parseTone(session.selectedTone) ?? 'soft';
  return sayTextByTone(session, selectedTone);
}
