import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  Client,
  Interaction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { createHash } from 'node:crypto';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { rememberOperation } from '../../infra/db/queries/dedupe';
import { consumeDailyQuota } from '../../app/policies/rateLimitPolicy';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import { buildDateIdeas, saveDateIdeasForWeekend } from '../../app/services/dateService';
import {
  createMediatorSaySession,
  getMediatorSaySelectedText,
  getMediatorSaySessionForUser,
  markMediatorSaySentToPair,
  renderMediatorSayReply,
  setMediatorSayTone,
} from '../../app/services/mediatorService';
import {
  getPairForCheckinChannel,
  listActiveAgreements,
  scheduleCheckinAgreementShare,
  submitWeeklyCheckin,
} from '../../app/services/checkinService';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { getDuelContributionForUser } from '../../app/services/duelService';
import { duelSubmitUsecase } from '../../app/usecases/duelUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logger } from '../../lib/logger';
import { dateOnly } from '../../lib/time';
import { logInteraction } from '../interactionLog';
import {
  buildAnonAskModal,
  buildAstroClaimPicker,
  buildAstroPairPicker,
  buildAstroSignPicker,
  buildCheckinAgreementSelect,
  buildCheckinShareButton,
  buildCheckinSubmitModal,
  buildDateGeneratorPicker,
  buildDuelSubmissionModal,
  buildOracleClaimPicker,
  buildMediatorSayToneButtons,
  buildRaidClaimButton,
  buildRaidConfirmButton
} from './components';
import { buildAnonQueueView } from './anonQueueView';
import { decodeCustomId } from './customId';
import {
  approveAnonQuestion,
  buildAnonMascotAnswer,
  createAnonQuestion,
  rejectAnonQuestion
} from '../../app/services/anonService';
import {
  claimOracle,
  markOracleClaimDelivery,
  parseOracleContext,
  parseOracleMode
} from '../../app/services/oracleService';
import {
  buildAstroPairView,
  claimAstroHoroscope,
  getAstroFeatureState,
  getUserZodiacSign,
  markAstroClaimDelivery,
  resolveCurrentAstroCycle,
  ASTRO_PUBLIC_DISCLAIMER,
  setUserZodiacSign
} from '../../app/services/astroHoroscopeService';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { claimRaidQuest, confirmRaidClaim, getRaidContributionForUser, getTodayRaidOffers } from '../../app/services/raidService';
import { renderDateIdeasResult } from '../projections/dateIdeasRenderer';
import { COMPONENTS_V2_FLAGS, toComponentsV2EditBody } from '../ui-v2';
import { parseDateBudget, parseDateEnergy, parseDateTimeWindow, type DateFilters } from '../../domain/date';
import {
  astroSignLabelRu,
  parseAstroContext,
  parseAstroMode,
  parseAstroSignKey,
  type AstroSignKey
} from '../../domain/astro';
import { handleSetupWizardComponent } from './setupWizard';
import { ANON_MASCOT_DAILY_LIMIT, ANON_PROPOSE_DAILY_LIMIT } from '../../config/constants';
import { t, type AppLocale } from '../../i18n';
import { createInteractionTranslator } from '../locale';
import { formatFeatureUnavailableError } from '../featureErrors';

export type InteractionContext = {
  client: Client;
  boss: PgBoss;
};

function isAdminOrConfiguredModeratorForComponent(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
  moderatorRoleId?: string | null,
): boolean {
  if (!interaction.inCachedGuild()) {
    return false;
  }

  if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!moderatorRoleId) {
    return false;
  }

  return interaction.member.roles.cache.has(moderatorRoleId);
}

const duelBoardPayloadSchema = z.object({ d: z.string().min(1) });
const raidBoardPayloadSchema = z.object({ r: z.string().min(1) });
const pairHomePayloadSchema = z.object({ p: z.string().uuid() });
const mediatorSessionPayloadSchema = z.object({ s: z.string().uuid() });
const datePayloadSchema = z.object({
  e: z.string().min(1),
  b: z.string().min(1),
  t: z.string().min(1)
});
const anonQuestionPayloadSchema = z.object({ q: z.string().uuid() });
const oraclePickerPayloadSchema = z.object({
  g: z.string().min(1),
  w: z.string().min(1),
  m: z.string().optional(),
  c: z.string().optional()
});
const astroClaimPayloadSchema = z.object({
  c: z.string().min(1).optional(),
  s: z.string().optional(),
  m: z.string().optional(),
  x: z.string().optional(),
  v: z.string().optional()
});
const astroPairPayloadSchema = z.object({
  a: z.string().optional(),
  b: z.string().optional(),
  u: z.string().optional(),
  p: z.string().optional()
});
const anonQueuePayloadSchema = z.object({
  p: z.string().optional()
});

function parseDateFilters(payload: Record<string, string>): DateFilters | null {
  const parsed = datePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const energy = parseDateEnergy(parsed.data.e);
  const budget = parseDateBudget(parsed.data.b);
  const timeWindow = parseDateTimeWindow(parsed.data.t);

  if (!energy || !budget || !timeWindow) {
    return null;
  }

  return {
    energy,
    budget,
    timeWindow
  };
}

function formatDatePickerSummary(locale: AppLocale, filters: DateFilters): string {
  return t(locale, 'date.summary', {
    energy: t(locale, `date.energy.${filters.energy}` as const),
    budget: t(locale, `date.budget.${filters.budget}` as const),
    time: t(locale, `date.time.${filters.timeWindow}` as const)
  });
}

function parseSayToneOrDefault(value: string): 'soft' | 'direct' | 'short' {
  if (value === 'direct') {
    return 'direct';
  }

  if (value === 'short') {
    return 'short';
  }

  return 'soft';
}

function parseOracleSelection(payload: Record<string, string>): {
  guildId: string;
  weekStartDate: string;
  mode: 'soft' | 'neutral' | 'hard';
  context: 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';
} | null {
  const parsed = oraclePickerPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const mode = parseOracleMode(parsed.data.m ?? 'soft');
  const context = parseOracleContext(parsed.data.c ?? 'ok');
  if (!mode || !context) {
    return null;
  }

  return {
    guildId: parsed.data.g,
    weekStartDate: parsed.data.w,
    mode,
    context
  };
}

function parseAstroClaimSelection(payload: Record<string, string>): {
  cycleStartDate?: string;
  sign: AstroSignKey;
  mode: 'soft' | 'neutral' | 'hard';
  context: 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';
  saveSign: 'save' | 'nosave';
} | null {
  const parsed = astroClaimPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const sign = parseAstroSignKey(parsed.data.s ?? 'aries');
  const mode = parsed.data.m === 's'
    ? parseAstroMode('soft')
    : parsed.data.m === 'h'
      ? parseAstroMode('hard')
      : parseAstroMode('neutral');
  const context = parsed.data.x === 'c'
    ? parseAstroContext('conflict')
    : parsed.data.x === 'b'
      ? parseAstroContext('boredom')
      : parsed.data.x === 'd'
        ? parseAstroContext('distance')
        : parsed.data.x === 'f'
          ? parseAstroContext('fatigue')
          : parsed.data.x === 'j'
            ? parseAstroContext('jealousy')
            : parseAstroContext('ok');
  const saveSign = parsed.data.v === 'y' ? 'save' : 'nosave';

  if (!sign || !mode || !context) {
    return null;
  }

  return {
    cycleStartDate: parsed.data.c,
    sign,
    mode,
    context,
    saveSign
  };
}

function parseAstroPairSelection(payload: Record<string, string>): {
  selfSign: AstroSignKey;
  partnerSign: AstroSignKey;
  selfSource: 'saved' | 'temp';
  partnerSource: 'saved' | 'temp';
} | null {
  const parsed = astroPairPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const selfSign = parseAstroSignKey(parsed.data.a ?? 'aries');
  const partnerSign = parseAstroSignKey(parsed.data.b ?? 'aries');
  if (!selfSign || !partnerSign) {
    return null;
  }

  return {
    selfSign,
    partnerSign,
    selfSource: parsed.data.u === 's' ? 'saved' : 'temp',
    partnerSource: parsed.data.p === 's' ? 'saved' : 'temp'
  };
}

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();
  const tr = await createInteractionTranslator(interaction);

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'anon_queue' && decoded.action === 'noop') {
    await interaction.deferUpdate();
    return;
  }

  if (decoded.feature === 'anon_queue' && decoded.action === 'page') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.admin_or_moderator_required') });
      return;
    }

    const parsedPayload = anonQueuePayloadSchema.safeParse(decoded.payload);
    if (!parsedPayload.success) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_moderation_queue') });
      return;
    }

    const requestedPageRaw = parsedPayload.data.p ?? '0';
    const requestedPage = Number.parseInt(requestedPageRaw, 10);
    const page = Number.isFinite(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    const queue = await buildAnonQueueView(interaction.guildId, page, 3, tr.locale);

    await interaction.update({
      content: queue.content,
      components: queue.components as never
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'rules') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.duel_board.rules'),
    });
    return;
  }

  if (decoded.feature === 'duel_board' && (decoded.action === 'participate' || decoded.action === 'how')) {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.duel_board.how'),
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'my_contribution') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const contribution = await getDuelContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply(tr.t('interaction.duel_board.no_contribution'));
      return;
    }

    await interaction.editReply(
      tr.t('interaction.duel_board.my_contribution', {
        submissions: contribution.submissions,
        points: contribution.points
      }),
    );
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'open_room') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair
        ? tr.t('pair.reply.your_room', { channelId: pair.privateChannelId })
        : tr.t('pair.reply.no_active_room'),
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'rules') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.raid_board.rules'),
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'how') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.raid_board.how'),
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'open_room') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair
        ? tr.t('pair.reply.your_room', { channelId: pair.privateChannelId })
        : tr.t('pair.reply.no_active_room'),
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'take_quests') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply(tr.t('raid.reply.no_offers_today'));
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} ${tr.t('interaction.common.points_short')}\n${offer.text}`,
    );

    await interaction.editReply({
      content: `${tr.t('raid.reply.today_offers', { dayDate: data.dayDate })}\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key, tr.locale)) as never
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'my_contribution') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const contribution = await getRaidContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply(tr.t('interaction.raid_board.no_contribution'));
      return;
    }

    await interaction.editReply(
      tr.t('interaction.raid_board.my_contribution', {
        dayDate: contribution.dayDate,
        todayPoints: contribution.todayPoints,
        weekPoints: contribution.weekPoints
      }),
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action.startsWith('say_tone_')) {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const payload = mediatorSessionPayloadSchema.parse(decoded.payload);
    const tone = decoded.action.replace('say_tone_', '');

    const session = await setMediatorSayTone({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: payload.s,
      tone
    });

    if (!session) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.session_expired') });
      return;
    }

    await interaction.update({
      content: renderMediatorSayReply(session, tr.locale),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }, tr.locale) as never
    });
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_send_pair') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const payload = mediatorSessionPayloadSchema.parse(decoded.payload);
    await interaction.deferUpdate();

    const existingSession = await getMediatorSaySessionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: payload.s
    });
    if (!existingSession) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.session_expired') });
      return;
    }

    if (!existingSession.pairId) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.no_active_pair_room') });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession, tr.locale),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }, tr.locale) as never
      });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== existingSession.pairId) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.pair_room_unavailable') });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession, tr.locale),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }, tr.locale) as never
      });
      return;
    }

    const pairChannel = await interaction.client.channels.fetch(pair.privateChannelId);
    if (!pairChannel?.isTextBased() || !('send' in pairChannel) || typeof pairChannel.send !== 'function') {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.pair_channel_not_sendable') });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession, tr.locale),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }, tr.locale) as never
      });
      return;
    }

    const marked = await markMediatorSaySentToPair({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sessionId: existingSession.id
    });

    const session = marked.session;
    if (!session) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.session_not_found') });
      return;
    }

    if (marked.changed) {
      await pairChannel.send({
        content: tr.t('interaction.mediator.sent_to_pair_content', {
          userId: interaction.user.id,
          text: getMediatorSaySelectedText(session)
        })
      });
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.sent_to_pair_success') });
    } else {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.mediator.sent_to_pair_already') });
    }

    await interaction.editReply({
      content: renderMediatorSayReply(session, tr.locale),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }, tr.locale) as never
    });
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'generate_ideas') {
    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_date_generator') });
      return;
    }

    await interaction.deferUpdate();

    const ideas = buildDateIdeas(filters);
    const view = renderDateIdeasResult({
      filters,
      ideas,
      locale: tr.locale
    });

    await interaction.editReply(
      toComponentsV2EditBody({
        components: view.components,
        flags: COMPONENTS_V2_FLAGS
      }) as never,
    );
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'save_weekend') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_date_save') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const ideas = buildDateIdeas(filters);
    const saved = await saveDateIdeasForWeekend({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      filters,
      ideas
    });
    const weekendDate = saved.row?.weekendDate ?? tr.t('interaction.date.current_weekend');

    await interaction.editReply(
      saved.created
        ? tr.t('interaction.date.saved_weekend', { weekendDate })
        : tr.t('interaction.date.saved_weekend_already', { weekendDate }),
    );
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'propose_question') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const modal = buildAnonAskModal(interaction.guildId, tr.locale);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'mascot_answer') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const payload = anonQuestionPayloadSchema.parse(decoded.payload);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const quota = await consumeDailyQuota({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      actionKey: 'anon_mascot_answer',
      limit: ANON_MASCOT_DAILY_LIMIT
    });
    if (!quota.allowed) {
      await interaction.editReply(tr.t('interaction.anon.mascot_daily_limit'));
      return;
    }

    const opDate = dateOnly(new Date());
    const dedupeKey = `anon:mascot:${interaction.guildId}:${payload.q}:${interaction.user.id}:${opDate}`;
    const firstRun = await rememberOperation(dedupeKey, {
      questionId: payload.q,
      userId: interaction.user.id
    });

    const answer = await buildAnonMascotAnswer({
      guildId: interaction.guildId,
      questionId: payload.q
    });

    await interaction.editReply(
      firstRun
        ? answer.answer
        : `${answer.answer}\n${tr.t('interaction.anon.answer_already_generated_today')}`,
    );
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'checkin') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair || pair.id !== payload.p) {
      await interaction.editReply(tr.t('interaction.pair_home.checkin_only_from_panel'));
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply(tr.t('checkin.reply.no_agreements'));
      return;
    }

    await interaction.editReply({
      content: tr.t('checkin.reply.select_agreement'),
      components: [
        buildCheckinAgreementSelect(
          agreements.map((agreement) => ({ key: agreement.key, text: agreement.text })),
          tr.locale
        ) as never
      ]
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'raid') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== payload.p) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.pair_home.action_only_active_pair') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply(tr.t('raid.reply.no_offers_today'));
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} ${tr.t('interaction.common.points_short')}\n${offer.text}`,
    );

    await interaction.editReply({
      content: `${tr.t('raid.reply.today_offers', { dayDate: data.dayDate })}\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key, tr.locale)) as never
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'duel_info') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    const snapshot = await getPairHomeSnapshot(payload.p);
    if (!snapshot) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.pair_home.panel_not_available') });
      return;
    }

    if (snapshot.user1Id !== interaction.user.id && snapshot.user2Id !== interaction.user.id) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('interaction.pair_home.action_only_members') });
      return;
    }

    const text = !snapshot.duel.active
      ? tr.t('interaction.pair_home.duel_none')
      : !snapshot.duel.roundNo
        ? tr.t('interaction.pair_home.duel_waiting_round')
        : tr.t('interaction.pair_home.duel_active_round', {
            roundNo: snapshot.duel.roundNo,
            endsPart: snapshot.duel.roundEndsAt
              ? tr.t('interaction.pair_home.duel_active_round_ends', {
                  endsAt: `<t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
                })
              : ''
          });
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: text });
    return;
  }

  if (decoded.feature === 'duel' && decoded.action === 'open_submit_modal') {
    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_duel') });
      return;
    }

    const modal = buildDuelSubmissionModal({ duelId, roundId, pairId }, tr.locale);
    await interaction.showModal(modal as never);

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'open_submit_modal',
      correlationId,
      pairId
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_open') {
    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_oracle') });
      return;
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.oracle.pick_mode_context'),
      components: buildOracleClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: selection.mode,
        context: selection.context
      }, tr.locale) as never
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_oracle_selection') });
      return;
    }

    await interaction.deferUpdate();

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimOracle({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      mode: selection.mode,
      context: selection.context
    });

    let delivered: 'dm' | 'pair' | 'ephemeral' = 'ephemeral';

    try {
      await interaction.user.send(claimed.text);
      delivered = 'dm';
    } catch {
      if (pair) {
        const channel = await interaction.client.channels.fetch(pair.privateChannelId);
        if (channel?.isTextBased() && 'send' in channel && typeof channel.send === 'function') {
          await channel.send({
            content: tr.t('interaction.oracle.weekly_to_pair_content', {
              userId: interaction.user.id,
              text: claimed.text
            })
          });
          delivered = 'pair';
        }
      }
    }

    await markOracleClaimDelivery(claimed.claim.id, delivered);

    const deliveryText = delivered === 'dm'
      ? tr.t('interaction.oracle.delivery_dm')
      : delivered === 'pair'
        ? tr.t('interaction.oracle.delivery_pair')
        : tr.t('interaction.oracle.delivery_fallback_here', { text: claimed.text });

    await interaction.editReply({
      content: claimed.created
        ? tr.t('interaction.oracle.claimed', { delivery: deliveryText })
        : tr.t('interaction.oracle.already_claimed', { delivery: deliveryText }),
      components: []
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'about') {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: tr.t('interaction.oracle.about'),
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'start_pair_ritual') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (pair) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'oracle_ritual_open',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair
        ? tr.t('interaction.oracle.ritual_open_pair_panel', { channelId: pair.privateChannelId })
        : tr.t('interaction.oracle.ritual_create_pair_first'),
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'about') {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `${tr.t('interaction.astro.about')}\n\n${ASTRO_PUBLIC_DISCLAIMER}`,
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'sign_open') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const state = await getAstroFeatureState(interaction.guildId);
    if (!state.enabled || !state.configured) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Astro Horoscope не настроен. Обратитесь к администратору.',
      });
      return;
    }

    const savedSign = await getUserZodiacSign(interaction.user.id);
    const payload = astroClaimPayloadSchema.safeParse(decoded.payload);
    const cycleStartDate = payload.success && payload.data.c
      ? payload.data.c
      : (await resolveCurrentAstroCycle(interaction.guildId)).cycleStartDate;

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Выберите знак по умолчанию.',
      components: buildAstroSignPicker({
        cycleStartDate,
        sign: savedSign ?? 'aries'
      }) as never
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'claim_open') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const state = await getAstroFeatureState(interaction.guildId);
    if (!state.enabled || !state.configured) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Astro Horoscope не настроен. Обратитесь к администратору.',
      });
      return;
    }

    const parsed = parseAstroClaimSelection(decoded.payload);
    const savedSign = await getUserZodiacSign(interaction.user.id);

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Выберите знак, тон и контекст, затем нажмите «Получить приватно».',
      components: buildAstroClaimPicker({
        sign: savedSign ?? parsed?.sign ?? 'aries',
        mode: parsed?.mode ?? 'neutral',
        context: parsed?.context ?? 'ok',
        saveSign: savedSign ? 'nosave' : 'save'
      }) as never
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const state = await getAstroFeatureState(interaction.guildId);
    if (!state.enabled || !state.configured) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Astro Horoscope не настроен. Обратитесь к администратору.',
      });
      return;
    }

    const selection = parseAstroClaimSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Некорректный выбор Astro Horoscope.',
      });
      return;
    }

    await interaction.deferUpdate();

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimAstroHoroscope({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      sign: selection.sign,
      mode: selection.mode,
      context: selection.context,
      saveSign: selection.saveSign === 'save'
    });

    await markAstroClaimDelivery(claimed.claim.id, 'ephemeral');
    await interaction.editReply({
      content: claimed.text,
      components: []
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'pair_open') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const state = await getAstroFeatureState(interaction.guildId);
    if (!state.enabled || !state.configured) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Astro Horoscope не настроен. Обратитесь к администратору.',
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair) {
      await interaction.editReply('Сначала создайте пару: `/pair create`.');
      return;
    }

    const partnerUserId = pair.user1Id === interaction.user.id ? pair.user2Id : pair.user1Id;
    const selfSign = await getUserZodiacSign(interaction.user.id);
    const partnerSign = await getUserZodiacSign(partnerUserId);

    if (selfSign && partnerSign) {
      const text = await buildAstroPairView({
        guildId: interaction.guildId,
        userSign: selfSign,
        partnerSign
      });

      await interaction.editReply(text);
      return;
    }

    await interaction.editReply({
      content: partnerSign
        ? 'Выберите ваш знак для просмотра.'
        : 'У партнера нет сохраненного знака. Выберите знак для этого просмотра.',
      components: buildAstroPairPicker({
        selfSign: selfSign ?? 'aries',
        partnerSign: partnerSign ?? 'aries',
        selfSource: selfSign ? 'saved' : 'temp',
        partnerSource: partnerSign ? 'saved' : 'temp'
      }) as never
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'pair_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const state = await getAstroFeatureState(interaction.guildId);
    if (!state.enabled || !state.configured) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Astro Horoscope не настроен. Обратитесь к администратору.',
      });
      return;
    }

    const selection = parseAstroPairSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Некорректный выбор пары для Astro.',
      });
      return;
    }

    await interaction.deferUpdate();

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair) {
      await interaction.editReply({
        content: 'Сначала создайте пару: `/pair create`.',
        components: []
      });
      return;
    }

    const text = await buildAstroPairView({
      guildId: interaction.guildId,
      userSign: selection.selfSign,
      partnerSign: selection.partnerSign
    });

    await interaction.editReply({
      content: text,
      components: []
    });
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'share_agreement') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const checkinId = decoded.payload.c;
    if (!checkinId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_checkin') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const shared = await scheduleCheckinAgreementShare({
      guildId: interaction.guildId,
      checkinId,
      requesterUserId: interaction.user.id
    });

    await requestPublicPostPublish(ctx.boss, {
      guildId: interaction.guildId,
      scheduledPostId: shared.scheduledPostId,
      reason: 'checkin_share',
      interactionId: interaction.id,
      userId: interaction.user.id,
      correlationId
    });

    await interaction.editReply(
      shared.created
        ? tr.t('interaction.checkin.share_queued')
        : tr.t('interaction.checkin.share_already_queued'),
    );
    return;
  }

  if (decoded.feature === 'anon' && (decoded.action === 'approve' || decoded.action === 'reject')) {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const questionId = decoded.payload.q;
    if (!questionId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_anon_moderation') });
      return;
    }

    await interaction.deferUpdate();
    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: tr.t('error.admin_or_moderator_required') });
      return;
    }

    let feedback = tr.t('interaction.anon.question_already_moderated');

    if (decoded.action === 'approve') {
      const approved = await approveAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      if (approved.changed && approved.scheduledPostId) {
        await requestPublicPostPublish(ctx.boss, {
          guildId: interaction.guildId,
          scheduledPostId: approved.scheduledPostId,
          reason: 'anon_approve',
          interactionId: interaction.id,
          userId: interaction.user.id,
          correlationId
        });
      }

      feedback = approved.changed
        ? tr.t('interaction.anon.question_approved')
        : tr.t('interaction.anon.question_already_moderated');
    } else {
      const rejected = await rejectAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      feedback = rejected.changed
        ? tr.t('interaction.anon.question_rejected')
        : tr.t('interaction.anon.question_already_moderated');
    }

    const queue = await buildAnonQueueView(interaction.guildId, 0, 3, tr.locale);
    await interaction.editReply({
      content: queue.content,
      components: queue.components as never
    });
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: feedback });

    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'claim') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const questKey = decoded.payload.q;
    if (!questKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_raid_claim') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await claimRaidQuest({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      questKey,
      sendConfirmMessage: async (params) => {
        const channel = await interaction.client.channels.fetch(params.pairPrivateChannelId);
        if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
          throw new Error(tr.t('interaction.mediator.pair_channel_not_sendable'));
        }

        await channel.send({
          content:
            `<@${params.claimerUserId}> ${tr.t('interaction.raid.claim_partner_confirm_prompt', {
              questKey: params.questKey,
              points: params.points
            })}`,
          components: [buildRaidConfirmButton(params.claimId, tr.locale) as never]
        });
      }
    });

    await interaction.editReply(
      result.created
        ? tr.t('interaction.raid.claim_created', { questKey })
        : tr.t('interaction.raid.claim_already_exists', { questKey }),
    );
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'confirm') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const claimId = decoded.payload.c;
    if (!claimId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_raid_confirm') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await confirmRaidClaim({
      guildId: interaction.guildId,
      claimId,
      confirmerUserId: interaction.user.id,
      boss: ctx.boss,
      correlationId
    });

    if (!result.changed && result.reason === 'same_user') {
      await interaction.editReply(tr.t('interaction.raid.confirm_same_user'));
      return;
    }

    if (!result.changed && result.reason === 'already_confirmed') {
      await interaction.editReply(tr.t('interaction.raid.confirm_already_confirmed'));
      return;
    }

    if (!result.changed) {
      await interaction.editReply(tr.t('interaction.raid.confirm_in_progress'));
      return;
    }

    await interaction.editReply(
      result.appliedPoints > 0
        ? tr.t('interaction.raid.confirm_applied', { points: result.appliedPoints })
        : tr.t('interaction.raid.confirm_capped'),
    );
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported_action') });
}

function parseCheckinScores(locale: AppLocale, interaction: ModalSubmitInteraction): [number, number, number, number, number] {
  const raw = ['s1', 's2', 's3', 's4', 's5'].map((field) => interaction.fields.getTextInputValue(field).trim());
  const values = raw.map((value) => Number.parseInt(value, 10));

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error(t(locale, 'error.checkin_scores_integer'));
  }

  return values as [number, number, number, number, number];
}

async function handleModal(ctx: InteractionContext, interaction: ModalSubmitInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();
  const tr = await createInteractionTranslator(interaction);

  if (decoded.feature === 'duel' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_duel_submission') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const answer = interaction.fields.getTextInputValue('answer');
    const result = await duelSubmitUsecase({
      guildId: interaction.guildId,
      duelId,
      roundId,
      pairId,
      answer,
      userId: interaction.user.id,
      correlationId,
      interactionId: interaction.id,
      boss: ctx.boss
    });

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'submit_modal',
      correlationId,
      pairId,
      jobId: null
    });

    await interaction.editReply(
      result.accepted
        ? tr.t('interaction.duel.submission_accepted')
        : tr.t('interaction.duel.submission_already_sent'),
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const source = interaction.fields.getTextInputValue('source');
    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const session = await createMediatorSaySession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      sourceText: source,
      locale: tr.locale
    });

    await interaction.editReply({
      content: renderMediatorSayReply(session, tr.locale),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }, tr.locale) as never
    });
    return;
  }

  if (decoded.feature === 'anon' && decoded.action === 'ask_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const question = interaction.fields.getTextInputValue('question').trim();

    const quota = await consumeDailyQuota({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      actionKey: 'anon_propose_question',
      limit: ANON_PROPOSE_DAILY_LIMIT
    });
    if (!quota.allowed) {
      await interaction.editReply(tr.t('interaction.anon.question_submit_daily_limit'));
      return;
    }

    const opDate = dateOnly(new Date());
    const digest = createHash('sha256').update(question).digest('hex').slice(0, 16);
    const dedupeKey = `anon:submit:${interaction.guildId}:${interaction.user.id}:${opDate}:${digest}`;
    const firstRun = await rememberOperation(dedupeKey, { question });
    if (!firstRun) {
      await interaction.editReply(tr.t('interaction.anon.question_already_submitted_today'));
      return;
    }

    const created = await createAnonQuestion({
      guildId: interaction.guildId,
      authorUserId: interaction.user.id,
      questionText: question
    });

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'ask_submit',
      correlationId
    });

    await interaction.editReply(tr.t('interaction.anon.question_queued', { requestId: created.id }));
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const agreementKey = decoded.payload.a;
    if (!agreementKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_checkin') });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.channelId) {
      await interaction.editReply(tr.t('error.channel_not_resolved'));
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });
    if (!pair) {
      await interaction.editReply(tr.t('checkin.reply.run_in_pair_room'));
      return;
    }

    const scores = parseCheckinScores(tr.locale, interaction);
    const result = await submitWeeklyCheckin({
      guildId: interaction.guildId,
      pairId: pair.id,
      userId: interaction.user.id,
      agreementKey,
      scores
    });

    logInteraction({
      interaction,
      feature: 'checkin',
      action: 'submit_modal',
      correlationId,
      pairId: pair.id
    });

    if (result.created) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'checkin_saved',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.editReply({
      content: result.created
        ? tr.t('interaction.checkin.submitted_with_share')
        : tr.t('interaction.checkin.existing_record_shown'),
      components: [buildCheckinShareButton(result.checkin.id, tr.locale) as never]
    });
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported_modal_action') });
}

async function handleSelect(
  ctx: InteractionContext,
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const tr = await createInteractionTranslator(interaction);

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'checkin' && decoded.action === 'agreement_select') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported.checkin_selector') });
      return;
    }

    const agreementKey = interaction.values[0];

    if (!interaction.guildId || !agreementKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_checkin_selection') });
      return;
    }

    const modal = buildCheckinSubmitModal(agreementKey, tr.locale);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'oracle' && (decoded.action === 'pick_mode' || decoded.action === 'pick_context')) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported.oracle_selector') });
      return;
    }

    const selection = parseOracleSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_oracle_selection_picker') });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.no_selection_value') });
      return;
    }

    const nextMode = decoded.action === 'pick_mode'
      ? parseOracleMode(selected)
      : selection.mode;
    const nextContext = decoded.action === 'pick_context'
      ? parseOracleContext(selected)
      : selection.context;

    if (!nextMode || !nextContext) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.invalid_option.oracle_selection') });
      return;
    }

    await interaction.update({
      content: tr.t('interaction.oracle.pick_mode_context'),
      components: buildOracleClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: nextMode,
        context: nextContext
      }, tr.locale) as never
    });
    return;
  }

  if (
    decoded.feature === 'astro'
    && (
      decoded.action === 'pick_sign'
      || decoded.action === 'pick_mode'
      || decoded.action === 'pick_context'
      || decoded.action === 'pick_save'
    )
  ) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Неподдерживаемый селектор Astro.',
      });
      return;
    }

    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.guild_only_action') });
      return;
    }

    const parsed = parseAstroClaimSelection(decoded.payload);
    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.no_selection_value') });
      return;
    }

    let sign = parsed?.sign ?? 'aries';
    let mode = parsed?.mode ?? 'neutral';
    let context = parsed?.context ?? 'ok';
    let saveSign = parsed?.saveSign ?? 'nosave';

    if (decoded.action === 'pick_sign') {
      const nextSign = parseAstroSignKey(selected);
      if (!nextSign) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Некорректный знак.' });
        return;
      }
      sign = nextSign;
    }

    if (decoded.action === 'pick_mode') {
      const nextMode = parseAstroMode(selected);
      if (!nextMode) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Некорректный тон.' });
        return;
      }
      mode = nextMode;
    }

    if (decoded.action === 'pick_context') {
      const nextContext = parseAstroContext(selected);
      if (!nextContext) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Некорректный контекст.' });
        return;
      }
      context = nextContext;
    }

    if (decoded.action === 'pick_save') {
      saveSign = selected === 'save' ? 'save' : 'nosave';
    }

    await interaction.update({
      content: 'Выберите знак, тон и контекст, затем нажмите «Получить приватно».',
      components: buildAstroClaimPicker({
        sign,
        mode,
        context,
        saveSign
      }) as never
    });
    return;
  }

  if (decoded.feature === 'astro' && decoded.action === 'set_sign') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Неподдерживаемый селектор Astro.',
      });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.no_selection_value') });
      return;
    }

    const sign = parseAstroSignKey(selected);
    if (!sign) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Некорректный знак.' });
      return;
    }

    await setUserZodiacSign(interaction.user.id, sign);
    await interaction.update({
      content: `Ваш знак сохранен: ${astroSignLabelRu[sign]} (${sign}).`,
      components: []
    });
    return;
  }

  if (
    decoded.feature === 'astro'
    && (decoded.action === 'pair_pick_self' || decoded.action === 'pair_pick_partner')
  ) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Неподдерживаемый селектор Astro пары.',
      });
      return;
    }

    const parsed = parseAstroPairSelection(decoded.payload);
    if (!parsed) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Некорректный payload Astro пары.',
      });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.no_selection_value') });
      return;
    }

    const selectedSign = parseAstroSignKey(selected);
    if (!selectedSign) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: 'Некорректный знак.',
      });
      return;
    }

    const nextSelfSign = decoded.action === 'pair_pick_self' ? selectedSign : parsed.selfSign;
    const nextPartnerSign = decoded.action === 'pair_pick_partner' ? selectedSign : parsed.partnerSign;

    await interaction.update({
      content: 'Нажмите «Показать синастрию».',
      components: buildAstroPairPicker({
        selfSign: nextSelfSign,
        partnerSign: nextPartnerSign,
        selfSource: decoded.action === 'pair_pick_self' ? 'temp' : parsed.selfSource,
        partnerSource: decoded.action === 'pair_pick_partner' ? 'temp' : parsed.partnerSource
      }) as never
    });
    return;
  }

  if (
    decoded.feature === 'date'
    && (decoded.action === 'pick_energy' || decoded.action === 'pick_budget' || decoded.action === 'pick_time')
  ) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported.date_selector') });
      return;
    }

    const current = parseDateFilters(decoded.payload);
    if (!current) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.payload.malformed_date_selector') });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.no_selection_value') });
      return;
    }

    const next: DateFilters = {
      energy: current.energy,
      budget: current.budget,
      timeWindow: current.timeWindow
    };

    if (decoded.action === 'pick_energy') {
      const parsed = parseDateEnergy(selected);
      if (!parsed) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.invalid_option.energy') });
        return;
      }
      next.energy = parsed;
    }

    if (decoded.action === 'pick_budget') {
      const parsed = parseDateBudget(selected);
      if (!parsed) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.invalid_option.budget') });
        return;
      }
      next.budget = parsed;
    }

    if (decoded.action === 'pick_time') {
      const parsed = parseDateTimeWindow(selected);
      if (!parsed) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.invalid_option.time') });
        return;
      }
      next.timeWindow = parsed;
    }

    await interaction.update({
      content: [
        tr.t('date.reply.pick_constraints'),
        formatDatePickerSummary(tr.locale, next)
      ].join('\n'),
      components: buildDateGeneratorPicker(next, tr.locale) as never
    });
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.unsupported_select_action') });
}

function componentTypeOfMessage(interaction: MessageComponentInteraction): string {
  if (interaction.isButton()) {
    return 'button';
  }

  if (interaction.isStringSelectMenu()) {
    return 'string_select';
  }

  if (interaction.isChannelSelectMenu()) {
    return 'channel_select';
  }

  if (interaction.isRoleSelectMenu()) {
    return 'role_select';
  }

  if (interaction.isUserSelectMenu()) {
    return 'user_select';
  }

  if (interaction.isMentionableSelectMenu()) {
    return 'mentionable_select';
  }

  return 'component';
}

type RoutedMessageComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction;

type RoutedInteraction = RoutedMessageComponentInteraction | ModalSubmitInteraction;

type InteractionLogContext = {
  interaction_id: string;
  type: string;
  component_type?: string;
  custom_id?: string;
  command_name?: string;
  guild_id: string | null;
  channel_id: string | null;
  user_id: string | null;
  message_id?: string;
  correlation_id?: string;
};

type ErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  status?: number;
  cause?: {
    name?: string;
    message?: string;
    code?: string | number;
    status?: number;
  };
};

type RouteDecision = {
  routeKey: string;
  decisionPath: string;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRoutedInteraction(interaction: Interaction): interaction is RoutedInteraction {
  return interaction.isMessageComponent() || interaction.isModalSubmit();
}

function hasReplyState(interaction: Interaction): interaction is Interaction & { deferred: boolean; replied: boolean } {
  return 'deferred' in interaction && 'replied' in interaction;
}

function customIdOf(interaction: Interaction): string | undefined {
  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    return interaction.customId;
  }

  return undefined;
}

function componentTypeOf(interaction: Interaction): string | undefined {
  if (!interaction.isMessageComponent()) {
    return undefined;
  }

  return componentTypeOfMessage(interaction);
}

function interactionCtx(
  interaction: Interaction,
  options?: {
    correlation_id?: string;
  },
): InteractionLogContext {
  const componentType = componentTypeOf(interaction);
  const customId = customIdOf(interaction);
  const context: InteractionLogContext = {
    interaction_id: interaction.id,
    type: String(interaction.type),
    guild_id: interaction.guildId ?? null,
    channel_id: interaction.channelId ?? null,
    user_id: interaction.user?.id ?? null
  };

  if (componentType) {
    context.component_type = componentType;
  }

  if (customId) {
    context.custom_id = customId;
  }

  if (interaction.isChatInputCommand()) {
    context.command_name = interaction.commandName;
  }

  if (interaction.isMessageComponent()) {
    context.message_id = interaction.message.id;
  }

  if (options?.correlation_id) {
    context.correlation_id = options.correlation_id;
  }

  return context;
}

function parseCode(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return undefined;
}

function parseStatus(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }

  return undefined;
}

function parseCause(value: unknown): ErrorInfo['cause'] {
  if (value instanceof Error) {
    const errorLike = value as Error & {
      code?: unknown;
      status?: unknown;
    };

    return {
      name: value.name,
      message: value.message,
      code: parseCode(errorLike.code),
      status: parseStatus(errorLike.status)
    };
  }

  if (!isObjectRecord(value)) {
    return undefined;
  }

  const name = typeof value.name === 'string' ? value.name : undefined;
  const message = typeof value.message === 'string' ? value.message : undefined;
  const code = parseCode(value.code);
  const status = parseStatus(value.status);

  if (!name && !message && code === undefined && status === undefined) {
    return undefined;
  }

  return {
    name,
    message,
    code,
    status
  };
}

function errInfo(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const errorLike = error as Error & {
      code?: unknown;
      status?: unknown;
      cause?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: parseCode(errorLike.code),
      status: parseStatus(errorLike.status),
      cause: parseCause(errorLike.cause)
    };
  }

  if (!isObjectRecord(error)) {
    return {
      name: 'NonErrorThrown',
      message: typeof error === 'string' ? error : 'Non-error value thrown'
    };
  }

  return {
    name: typeof error.name === 'string' ? error.name : 'NonErrorThrown',
    message: typeof error.message === 'string' ? error.message : 'Non-error value thrown',
    stack: typeof error.stack === 'string' ? error.stack : undefined,
    code: parseCode(error.code),
    status: parseStatus(error.status),
    cause: parseCause(error.cause)
  };
}

function deriveRouteDecision(interaction: Interaction): RouteDecision {
  if (interaction.isButton()) {
    return {
      routeKey: 'button',
      decisionPath: 'isButton -> handleButton'
    };
  }

  if (interaction.isModalSubmit()) {
    return {
      routeKey: 'modal_submit',
      decisionPath: 'isModalSubmit -> handleModal'
    };
  }

  if (interaction.isStringSelectMenu()) {
    return {
      routeKey: 'string_select',
      decisionPath: 'isStringSelectMenu -> handleSelect'
    };
  }

  if (interaction.isChannelSelectMenu()) {
    return {
      routeKey: 'channel_select',
      decisionPath: 'isChannelSelectMenu -> handleSelect'
    };
  }

  if (interaction.isRoleSelectMenu()) {
    return {
      routeKey: 'role_select',
      decisionPath: 'isRoleSelectMenu -> handleSelect'
    };
  }

  if (interaction.isMessageComponent()) {
    return {
      routeKey: `unsupported_component:${componentTypeOfMessage(interaction)}`,
      decisionPath: 'isMessageComponent -> unsupported component type'
    };
  }

  if (interaction.isChatInputCommand()) {
    return {
      routeKey: `command:${interaction.commandName}`,
      decisionPath: 'isChatInputCommand -> handled by command router'
    };
  }

  return {
    routeKey: 'unsupported_interaction',
    decisionPath: 'no supported guard matched'
  };
}

function deriveCustomRouteKey(interaction: Interaction): { routeKey?: string; reason?: string } {
  const customId = customIdOf(interaction);
  if (!customId) {
    return { reason: 'custom_id_missing' };
  }

  try {
    const decoded = decodeCustomId(customId);
    return { routeKey: `${decoded.feature}:${decoded.action}` };
  } catch {
    return { reason: 'custom_id_unparseable' };
  }
}

export async function routeInteractionComponent(
  ctx: InteractionContext,
  interaction: Interaction,
): Promise<void> {
  const correlationId = createCorrelationId();
  const baseCtx = interactionCtx(interaction, { correlation_id: correlationId });
  const decision = deriveRouteDecision(interaction);
  const customRoute = deriveCustomRouteKey(interaction);
  const routeKey = customRoute.routeKey ?? decision.routeKey;
  const decisionPath = decision.decisionPath;

  logger.info(
    {
      action: 'invoke',
      ...baseCtx
    },
    'Interaction handler invoked',
  );

  if ((interaction.isMessageComponent() || interaction.isModalSubmit()) && customRoute.reason) {
    logger.warn(
      {
        action: 'route_skip',
        ...baseCtx,
        routeKey,
        reason: customRoute.reason,
        decision_path: decisionPath
      },
      'Route metadata could not be derived from custom_id',
    );
  }

  logger.info(
    {
      action: 'route',
      ...baseCtx,
      routeKey,
      decision_path: decisionPath
    },
    'Routing interaction',
  );

  try {
    if (!isRoutedInteraction(interaction)) {
      logger.warn(
        {
          action: 'route_skip',
          ...baseCtx,
          routeKey,
          reason: interaction.isChatInputCommand()
            ? 'chat_input_handled_in_command_router'
            : 'unsupported_interaction_type',
          decision_path: decisionPath
        },
        'Interaction is not routed by component router',
      );
      return;
    }

    if (interaction.isButton()) {
      await handleButton(ctx, interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(ctx, interaction);
      return;
    }

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleSelect(ctx, interaction);
      return;
    }

    logger.warn(
      {
        action: 'route_skip',
        ...baseCtx,
        routeKey,
        reason: 'unsupported_component_type',
        decision_path: decisionPath
      },
      'Message component type is not supported by router',
    );
  } catch (error) {
    logger.error(
      {
        action: 'route_failed',
        ...baseCtx,
        routeKey,
        decision_path: decisionPath,
        custom_id: customIdOf(interaction),
        component_type: componentTypeOf(interaction),
        deferred: hasReplyState(interaction) ? interaction.deferred : undefined,
        replied: hasReplyState(interaction) ? interaction.replied : undefined,
        error: errInfo(error)
      },
      'Interaction component routing failed',
    );

    const featureError = formatFeatureUnavailableError('ru', error);
    if (featureError && interaction.isRepliable() && hasReplyState(interaction)) {
      if (interaction.deferred) {
        try {
          await interaction.followUp({ flags: MessageFlags.Ephemeral, content: featureError });
        } catch {
          await interaction.editReply(featureError);
        }
        return;
      }

      if (!interaction.replied) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: featureError });
      }
      return;
    }

    if (!interaction.isRepliable() || !hasReplyState(interaction)) {
      return;
    }

    const tr = await createInteractionTranslator(interaction);

    if (interaction.deferred) {
      await interaction.editReply(tr.t('error.interaction_failed'));
      return;
    }

    if (!interaction.replied) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: tr.t('error.interaction_failed') });
    }
  }
}
