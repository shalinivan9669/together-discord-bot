import type {
  ButtonInteraction,
  Client,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import type PgBoss from 'pg-boss';
import { isFeatureEnabled } from '../../config/featureFlags';
import { duelSubmitUsecase } from '../../app/usecases/duelUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logger } from '../../lib/logger';
import { logInteraction } from '../interactionLog';
import { buildDuelSubmissionModal } from './components';
import { decodeCustomId } from './customId';

export type InteractionContext = {
  client: Client;
  boss: PgBoss;
};

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

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

  await interaction.reply({ ephemeral: true, content: 'Unsupported action.' });
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
    await interaction.deferReply({ ephemeral: true });

    if (!isFeatureEnabled('anon')) {
      await interaction.editReply('Anonymous questions are not enabled in this deployment.');
      return;
    }

    await interaction.editReply('Anon modal handler wired. Publishing flow is TODO behind feature flag.');
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported modal action.' });
}

async function handleSelect(
  _ctx: InteractionContext,
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await interaction.reply({ ephemeral: true, content: 'Select handler is wired for phase 2.' });
}

export async function routeInteractionComponent(
  ctx: InteractionContext,
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
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

    if (interaction.isStringSelectMenu()) {
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