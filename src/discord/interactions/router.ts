import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  Client,
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
  buildCheckinAgreementSelect,
  buildCheckinShareButton,
  buildCheckinSubmitModal,
  buildDateGeneratorPicker,
  buildDuelSubmissionModal,
  buildHoroscopeClaimPicker,
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
  claimHoroscope,
  markHoroscopeClaimDelivery,
  parseHoroscopeContext,
  parseHoroscopeMode
} from '../../app/services/horoscopeService';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { claimRaidQuest, confirmRaidClaim, getRaidContributionForUser, getTodayRaidOffers } from '../../app/services/raidService';
import { renderDateIdeasResult } from '../projections/dateIdeasRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import { parseDateBudget, parseDateEnergy, parseDateTimeWindow, type DateFilters } from '../../domain/date';
import { handleSetupWizardComponent } from './setupWizard';
import { ANON_MASCOT_DAILY_LIMIT, ANON_PROPOSE_DAILY_LIMIT } from '../../config/constants';

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
const horoscopePickerPayloadSchema = z.object({
  g: z.string().min(1),
  w: z.string().min(1),
  m: z.string().optional(),
  c: z.string().optional()
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

function formatDatePickerSummary(filters: DateFilters): string {
  return `Energy: **${filters.energy}** | Budget: **${filters.budget}** | Time: **${filters.timeWindow}**`;
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

function parseHoroscopeSelection(payload: Record<string, string>): {
  guildId: string;
  weekStartDate: string;
  mode: 'soft' | 'neutral' | 'hard';
  context: 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';
} | null {
  const parsed = horoscopePickerPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const mode = parseHoroscopeMode(parsed.data.m ?? 'soft');
  const context = parseHoroscopeContext(parsed.data.c ?? 'ok');
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

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

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
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Admin or configured moderator role is required.' });
      return;
    }

    const parsedPayload = anonQueuePayloadSchema.safeParse(decoded.payload);
    if (!parsedPayload.success) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed moderation queue payload.' });
      return;
    }

    const requestedPageRaw = parsedPayload.data.p ?? '0';
    const requestedPage = Number.parseInt(requestedPageRaw, 10);
    const page = Number.isFinite(requestedPage) && requestedPage >= 0 ? requestedPage : 0;
    const queue = await buildAnonQueueView(interaction.guildId, page, 3);

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
      content:
        'Rules: one submission per pair per active round. A moderator starts and closes rounds. ' +
        'Pair totals rank by points first and pair id as deterministic tiebreaker.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && (decoded.action === 'participate' || decoded.action === 'how')) {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'How to participate: join your pair room, wait for a round start message, press Submit answer, ' +
        'then complete the modal once before the timer ends.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'my_contribution') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const contribution = await getDuelContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply('No active duel contribution found for your pair yet.');
      return;
    }

    await interaction.editReply(
      `My duel contribution: **${contribution.submissions}** submission(s), ` +
      `**${contribution.points}** point(s) total.`,
    );
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'open_room') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'rules') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'Raid rules: claim one of today quests, then your partner confirms in the pair room. ' +
        'Daily pair cap applies automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'how') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'How it works: open your pair room, pick one today quest, claim it, then ask your partner to confirm. ' +
        'Progress and contribution update automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'open_room') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'take_quests') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'my_contribution') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const contribution = await getRaidContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply('No active raid contribution found for your pair yet.');
      return;
    }

    await interaction.editReply(
      `My contribution (${contribution.dayDate}): **${contribution.todayPoints}** today, ` +
      `**${contribution.weekPoints}** this raid week.`,
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action.startsWith('say_tone_')) {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
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
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Session expired. Run `/say` again.' });
      return;
    }

    await interaction.update({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_send_pair') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
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
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Session expired. Run `/say` again.' });
      return;
    }

    if (!existingSession.pairId) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'No active pair room found for this account.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
      });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== existingSession.pairId) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Pair room is not available anymore.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
      });
      return;
    }

    const pairChannel = await interaction.client.channels.fetch(pair.privateChannelId);
    if (!pairChannel?.isTextBased() || !('send' in pairChannel) || typeof pairChannel.send !== 'function') {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Pair room channel is not sendable.' });
      await interaction.editReply({
        content: renderMediatorSayReply(existingSession),
        components: buildMediatorSayToneButtons({
          sessionId: existingSession.id,
          selectedTone: parseSayToneOrDefault(existingSession.selectedTone),
          canSendToPairRoom: false,
          alreadySent: Boolean(existingSession.sentToPairAt)
        }) as never
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
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Session not found.' });
      return;
    }

    if (marked.changed) {
      await pairChannel.send({
        content: `<@${interaction.user.id}> drafted this with /say:\n\n${getMediatorSaySelectedText(session)}`
      });
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Sent to your pair room.' });
    } else {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Already sent to pair room earlier.' });
    }

    await interaction.editReply({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'generate_ideas') {
    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed date generator payload.' });
      return;
    }

    await interaction.deferUpdate();

    const ideas = buildDateIdeas(filters);
    const view = renderDateIdeasResult({
      filters,
      ideas
    });

    await interaction.editReply({
      content: null,
      components: view.components as never,
      flags: COMPONENTS_V2_FLAGS
    } as never);
    return;
  }

  if (decoded.feature === 'date' && decoded.action === 'save_weekend') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const filters = parseDateFilters(decoded.payload);
    if (!filters) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed date save payload.' });
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
    const weekendDate = saved.row?.weekendDate ?? 'current';

    await interaction.editReply(
      saved.created
        ? `Saved for weekend (${weekendDate}).`
        : `Already saved for weekend (${weekendDate}).`,
    );
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'propose_question') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const modal = buildAnonAskModal(interaction.guildId);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'anon_qotd' && decoded.action === 'mascot_answer') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
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
      await interaction.editReply('Mascot answer daily limit reached. Try again tomorrow.');
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

    await interaction.editReply(firstRun ? answer.answer : `${answer.answer}\n(Already generated today.)`);
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'checkin') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair || pair.id !== payload.p) {
      await interaction.editReply('Run check-in from your pair room panel only.');
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply('No active agreements found. Run seed script first.');
      return;
    }

    await interaction.editReply({
      content: 'Select one weekly agreement, then fill the 5-score modal.',
      components: [
        buildCheckinAgreementSelect(agreements.map((agreement) => ({ key: agreement.key, text: agreement.text }))) as never
      ]
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'raid') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== payload.p) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'This panel action is only for your active pair.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'duel_info') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    const snapshot = await getPairHomeSnapshot(payload.p);
    if (!snapshot) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Pair panel is not available.' });
      return;
    }

    if (snapshot.user1Id !== interaction.user.id && snapshot.user2Id !== interaction.user.id) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'This panel action is only for pair members.' });
      return;
    }

    const text = !snapshot.duel.active
      ? 'No active duel right now.'
      : !snapshot.duel.roundNo
        ? 'Duel is active but no round is running right now.'
        : `Round #${snapshot.duel.roundNo} is active${snapshot.duel.roundEndsAt
          ? ` and ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
          : ''}.`;
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: text });
    return;
  }

  if (decoded.feature === 'duel' && decoded.action === 'open_submit_modal') {
    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed duel payload.' });
      return;
    }

    const modal = buildDuelSubmissionModal({ duelId, roundId, pairId });
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

  if (decoded.feature === 'horoscope' && decoded.action === 'claim_open') {
    const selection = parseHoroscopeSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed horoscope payload.' });
      return;
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Pick your mode and context, then press **Get privately**.',
      components: buildHoroscopeClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: selection.mode,
        context: selection.context
      }) as never
    });
    return;
  }

  if (decoded.feature === 'horoscope' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const selection = parseHoroscopeSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed horoscope selection.' });
      return;
    }

    await interaction.deferUpdate();

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimHoroscope({
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
            content: `<@${interaction.user.id}> weekly horoscope:\n\n${claimed.text}`
          });
          delivered = 'pair';
        }
      }
    }

    await markHoroscopeClaimDelivery(claimed.claim.id, delivered);

    const deliveryText = delivered === 'dm'
      ? 'Delivered to your DM.'
      : delivered === 'pair'
        ? 'DM unavailable, delivered to your pair room.'
        : `DM and pair-room fallback unavailable, showing here:\n\n${claimed.text}`;

    await interaction.editReply({
      content: claimed.created
        ? `Horoscope claimed. ${deliveryText}`
        : `You already claimed this week. ${deliveryText}`,
      components: []
    });
    return;
  }

  if (decoded.feature === 'horoscope' && decoded.action === 'about') {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        'Weekly horoscope is deterministic and built from seeded templates. ' +
        'No runtime LLM generation is used in production loops.',
    });
    return;
  }

  if (decoded.feature === 'horoscope' && decoded.action === 'start_pair_ritual') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (pair) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'horoscope_ritual_open',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: pair
        ? `Open your pair panel in <#${pair.privateChannelId}> and start the ritual there.`
        : 'Create a pair room first with `/pair create`, then start the ritual there.',
    });
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'share_agreement') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const checkinId = decoded.payload.c;
    if (!checkinId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed check-in payload.' });
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
        ? 'Agreement queued for public posting.'
        : 'Agreement share was already queued earlier.',
    );
    return;
  }

  if (decoded.feature === 'anon' && (decoded.action === 'approve' || decoded.action === 'reject')) {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const questionId = decoded.payload.q;
    if (!questionId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed anon moderation payload.' });
      return;
    }

    await interaction.deferUpdate();
    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.followUp({ flags: MessageFlags.Ephemeral, content: 'Admin or configured moderator role is required.' });
      return;
    }

    let feedback = 'Question already moderated.';

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
        ? 'Question approved and queued for publishing.'
        : 'Question already moderated.';
    } else {
      const rejected = await rejectAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      feedback = rejected.changed ? 'Question rejected.' : 'Question already moderated.';
    }

    const queue = await buildAnonQueueView(interaction.guildId, 0, 3);
    await interaction.editReply({
      content: queue.content,
      components: queue.components as never
    });
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: feedback });

    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'claim') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const questKey = decoded.payload.q;
    if (!questKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed raid claim payload.' });
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
          throw new Error('Pair room channel is not sendable');
        }

        await channel.send({
          content:
            `<@${params.claimerUserId}> claimed **${params.questKey}** for ${params.points} points.\n` +
            'Partner, press confirm when completed.',
          components: [buildRaidConfirmButton(params.claimId) as never]
        });
      }
    });

    await interaction.editReply(
      result.created
        ? `Claim created for **${questKey}**. Confirmation sent to your pair room.`
        : `Claim for **${questKey}** already exists today.`,
    );
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'confirm') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const claimId = decoded.payload.c;
    if (!claimId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed raid confirm payload.' });
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
      await interaction.editReply('The same user who claimed cannot confirm. Ask your partner to confirm.');
      return;
    }

    if (!result.changed && result.reason === 'already_confirmed') {
      await interaction.editReply('This claim was already confirmed.');
      return;
    }

    if (!result.changed) {
      await interaction.editReply('Claim confirmation is already in progress. Try again shortly.');
      return;
    }

    await interaction.editReply(
      result.appliedPoints > 0
        ? `Claim confirmed. +${result.appliedPoints} raid points applied.`
        : 'Daily cap reached for this pair. Claim marked as capped.',
    );
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported action.' });
}

function parseCheckinScores(interaction: ModalSubmitInteraction): [number, number, number, number, number] {
  const raw = ['s1', 's2', 's3', 's4', 's5'].map((field) => interaction.fields.getTextInputValue(field).trim());
  const values = raw.map((value) => Number.parseInt(value, 10));

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error('Each score must be an integer.');
  }

  return values as [number, number, number, number, number];
}

async function handleModal(ctx: InteractionContext, interaction: ModalSubmitInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'duel' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed duel submission payload.' });
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
        ? 'Submission accepted. Scoreboard will refresh shortly.'
        : 'You already submitted for this round. Keeping your first submission.',
    );
    return;
  }

  if (decoded.feature === 'mediator' && decoded.action === 'say_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const source = interaction.fields.getTextInputValue('source');
    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const session = await createMediatorSaySession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      sourceText: source
    });

    await interaction.editReply({
      content: renderMediatorSayReply(session),
      components: buildMediatorSayToneButtons({
        sessionId: session.id,
        selectedTone: parseSayToneOrDefault(session.selectedTone),
        canSendToPairRoom: Boolean(session.pairId),
        alreadySent: Boolean(session.sentToPairAt)
      }) as never
    });
    return;
  }

  if (decoded.feature === 'anon' && decoded.action === 'ask_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
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
      await interaction.editReply('Question submit daily limit reached. Try again tomorrow.');
      return;
    }

    const opDate = dateOnly(new Date());
    const digest = createHash('sha256').update(question).digest('hex').slice(0, 16);
    const dedupeKey = `anon:submit:${interaction.guildId}:${interaction.user.id}:${opDate}:${digest}`;
    const firstRun = await rememberOperation(dedupeKey, { question });
    if (!firstRun) {
      await interaction.editReply('This exact question was already submitted today.');
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

    await interaction.editReply(`Question queued for moderation. Request id: \`${created.id}\``);
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Guild-only action.' });
      return;
    }

    const agreementKey = decoded.payload.a;
    if (!agreementKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.channelId) {
      await interaction.editReply('Unable to resolve channel for check-in submission.');
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });
    if (!pair) {
      await interaction.editReply('Run check-in flow inside your pair room.');
      return;
    }

    const scores = parseCheckinScores(interaction);
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
        ? 'Weekly check-in submitted. You can optionally share agreement publicly.'
        : 'Check-in already exists for this pair/week. Showing the existing record.',
      components: [buildCheckinShareButton(result.checkin.id) as never]
    });
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported modal action.' });
}

async function handleSelect(
  ctx: InteractionContext,
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'checkin' && decoded.action === 'agreement_select') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported check-in selector.' });
      return;
    }

    const agreementKey = interaction.values[0];

    if (!interaction.guildId || !agreementKey) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed check-in selection payload.' });
      return;
    }

    const modal = buildCheckinSubmitModal(agreementKey);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'horoscope' && (decoded.action === 'pick_mode' || decoded.action === 'pick_context')) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported horoscope selector.' });
      return;
    }

    const selection = parseHoroscopeSelection(decoded.payload);
    if (!selection) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed horoscope selection payload.' });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'No selection value.' });
      return;
    }

    const nextMode = decoded.action === 'pick_mode'
      ? parseHoroscopeMode(selected)
      : selection.mode;
    const nextContext = decoded.action === 'pick_context'
      ? parseHoroscopeContext(selected)
      : selection.context;

    if (!nextMode || !nextContext) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Invalid horoscope selection option.' });
      return;
    }

    await interaction.update({
      content: 'Pick your mode and context, then press **Get privately**.',
      components: buildHoroscopeClaimPicker({
        guildId: selection.guildId,
        weekStartDate: selection.weekStartDate,
        mode: nextMode,
        context: nextContext
      }) as never
    });
    return;
  }

  if (
    decoded.feature === 'date'
    && (decoded.action === 'pick_energy' || decoded.action === 'pick_budget' || decoded.action === 'pick_time')
  ) {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported date selector.' });
      return;
    }

    const current = parseDateFilters(decoded.payload);
    if (!current) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Malformed date selector payload.' });
      return;
    }

    const selected = interaction.values[0];
    if (!selected) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'No selection value.' });
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
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Invalid energy option.' });
        return;
      }
      next.energy = parsed;
    }

    if (decoded.action === 'pick_budget') {
      const parsed = parseDateBudget(selected);
      if (!parsed) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Invalid budget option.' });
        return;
      }
      next.budget = parsed;
    }

    if (decoded.action === 'pick_time') {
      const parsed = parseDateTimeWindow(selected);
      if (!parsed) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Invalid time option.' });
        return;
      }
      next.timeWindow = parsed;
    }

    await interaction.update({
      content: [
        'Pick your constraints, then press **Generate 3 ideas**.',
        formatDatePickerSummary(next)
      ].join('\n'),
      components: buildDateGeneratorPicker(next) as never
    });
    return;
  }

  await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unsupported select action.' });
}

export async function routeInteractionComponent(
  ctx: InteractionContext,
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
): Promise<void> {
  try {
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
    }
  } catch (error) {
    logger.error({ error, interaction_id: interaction.id }, 'Interaction component routing failed');

    if (interaction.deferred) {
      await interaction.editReply('Interaction failed. Please try again.');
      return;
    }

    if (!interaction.replied) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Interaction failed. Please try again.' });
    }
  }
}

