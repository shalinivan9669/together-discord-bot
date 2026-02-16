import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { encodeCustomId } from './customId';

export function buildDuelSubmitButton(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'open_submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Submit answer').setStyle(ButtonStyle.Primary),
  );
}

export function buildDuelSubmissionModal(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Round submission');

  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel('Your round answer')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(400)
    .setRequired(true)
    .setPlaceholder('Write your submission here...');

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
  return modal;
}