import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  Client,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import {
  getPairForCheckinChannel,
  listActiveAgreements,
  scheduleCheckinAgreementShare,
  submitWeeklyCheckin,
} from '../../app/services/checkinService';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { duelSubmitUsecase } from '../../app/usecases/duelUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logger } from '../../lib/logger';
import { logInteraction } from '../interactionLog';
import {
  buildCheckinAgreementSelect,
  buildCheckinShareButton,
  buildCheckinSubmitModal,
  buildDuelSubmissionModal,
  buildHoroscopeClaimModal,
  buildRaidClaimButton,
  buildRaidConfirmButton
} from './components';
import { decodeCustomId } from './customId';
import {
  approveAnonQuestion,
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
import { handleSetupWizardComponent } from './setupWizard';

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

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'rules') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Rules: one submission per pair per active round. A moderator starts and closes rounds. ' +
        'Pair totals rank by points first and pair id as deterministic tiebreaker.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'participate') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'How to participate: join your pair room, wait for a round start message, press Submit answer, ' +
        'then complete the modal once before the timer ends.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'open_room') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'rules') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Raid rules: claim one of today quests, then your partner confirms in the pair room. ' +
        'Daily pair cap applies automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'take_quests') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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

  if (decoded.feature === 'pair_home' && decoded.action === 'checkin') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== payload.p) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for your active pair.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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
      await interaction.reply({ ephemeral: true, content: 'Pair panel is not available.' });
      return;
    }

    if (snapshot.user1Id !== interaction.user.id && snapshot.user2Id !== interaction.user.id) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for pair members.' });
      return;
    }

    const text = !snapshot.duel.active
      ? 'No active duel right now.'
      : !snapshot.duel.roundNo
        ? 'Duel is active but no round is running right now.'
        : `Round #${snapshot.duel.roundNo} is active${snapshot.duel.roundEndsAt
          ? ` and ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
          : ''}.`;
    await interaction.reply({ ephemeral: true, content: text });
    return;
  }

  if (decoded.feature === 'duel' && decoded.action === 'open_submit_modal') {
    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel payload.' });
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
    const guildId = decoded.payload.g;
    const weekStartDate = decoded.payload.w;
    if (!guildId || !weekStartDate) {
      await interaction.reply({ ephemeral: true, content: 'Malformed horoscope payload.' });
      return;
    }

    const modal = buildHoroscopeClaimModal(guildId, weekStartDate);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'horoscope' && decoded.action === 'about') {
    await interaction.reply({
      ephemeral: true,
      content:
        'Weekly horoscope is deterministic and built from seeded templates. ' +
        'No runtime LLM generation is used in production loops.',
    });
    return;
  }

  if (decoded.feature === 'horoscope' && decoded.action === 'start_pair_ritual') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair
        ? `Start ritual in your pair room: <#${pair.privateChannelId}>`
        : 'Create a pair room first with `/pair create`, then start the ritual there.',
    });
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'share_agreement') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const checkinId = decoded.payload.c;
    if (!checkinId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questionId = decoded.payload.q;
    if (!questionId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed anon moderation payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.editReply('Admin or configured moderator role is required.');
      return;
    }

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

      await interaction.editReply(
        approved.changed
          ? 'Question approved and queued for publishing.'
          : 'Question already moderated.',
      );
      return;
    }

    const rejected = await rejectAnonQuestion({
      guildId: interaction.guildId,
      questionId,
      moderatorUserId: interaction.user.id
    });

    await interaction.editReply(rejected.changed ? 'Question rejected.' : 'Question already moderated.');
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'claim') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questKey = decoded.payload.q;
    if (!questKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid claim payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

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
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const claimId = decoded.payload.c;
    if (!claimId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid confirm payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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

  await interaction.reply({ ephemeral: true, content: 'Unsupported action.' });
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
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel submission payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

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

  if (decoded.feature === 'anon' && decoded.action === 'ask_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const question = interaction.fields.getTextInputValue('question');
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

  if (decoded.feature === 'horoscope' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const modeInput = interaction.fields.getTextInputValue('mode');
    const contextInput = interaction.fields.getTextInputValue('context');
    const mode = parseHoroscopeMode(modeInput);
    const context = parseHoroscopeContext(contextInput);
    if (!mode || !context) {
      await interaction.editReply(
        'Invalid mode/context. Use mode: soft/neutral/hard and context: conflict/ok/boredom/distance/fatigue/jealousy.',
      );
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimHoroscope({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      mode,
      context
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

    await interaction.editReply(
      claimed.created
        ? `Horoscope claimed. ${deliveryText}`
        : `You already claimed this week. ${deliveryText}`,
    );
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const agreementKey = decoded.payload.a;
    if (!agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
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

  await interaction.reply({ ephemeral: true, content: 'Unsupported modal action.' });
}

async function handleSelect(
  ctx: InteractionContext,
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);

  if (decoded.feature === 'setup_wizard') {
    if (!interaction.isChannelSelectMenu() && !interaction.isRoleSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported setup wizard selector.' });
      return;
    }

    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'checkin' && decoded.action === 'agreement_select') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported check-in selector.' });
      return;
    }

    const agreementKey = interaction.values[0];

    if (!interaction.guildId || !agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in selection payload.' });
      return;
    }

    const modal = buildCheckinSubmitModal(agreementKey);
    await interaction.showModal(modal as never);
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported select action.' });
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
      await interaction.reply({ ephemeral: true, content: 'Interaction failed. Please try again.' });
    }
  }
}
