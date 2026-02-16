import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
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

export function buildHoroscopeClaimModal(guildId: string, weekStartDate: string) {
  const customId = encodeCustomId({
    feature: 'horoscope',
    action: 'claim_submit',
    payload: {
      g: guildId,
      w: weekStartDate
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Your weekly horoscope');

  const modeInput = new TextInputBuilder()
    .setCustomId('mode')
    .setLabel('Mode: soft / neutral / hard')
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(16)
    .setRequired(true)
    .setPlaceholder('soft');

  const contextInput = new TextInputBuilder()
    .setCustomId('context')
    .setLabel('Context: conflict/ok/boredom/distance/fatigue/jealousy')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(24)
    .setRequired(true)
    .setPlaceholder('ok');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(modeInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contextInput),
  );

  return modal;
}

export function buildCheckinAgreementSelect(options: Array<{ key: string; text: string }>) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'agreement_select',
    payload: {}
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select this week agreement')
    .addOptions(
      options.map((item) => ({
        label: item.text.slice(0, 100),
        description: item.key,
        value: item.key
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCheckinSubmitModal(agreementKey: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'submit_modal',
    payload: {
      a: agreementKey
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Weekly check-in');

  const fields = [
    { id: 's1', label: 'Communication quality (1-10)' },
    { id: 's2', label: 'Emotional support (1-10)' },
    { id: 's3', label: 'Shared time quality (1-10)' },
    { id: 's4', label: 'Conflict repair (1-10)' },
    { id: 's5', label: 'Overall week (1-10)' }
  ] as const;

  for (const field of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
          .setPlaceholder('8'),
      ),
    );
  }

  return modal;
}

export function buildCheckinShareButton(checkinId: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'share_agreement',
    payload: {
      c: checkinId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Share agreement publicly')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildAnonModerationButtons(questionId: string) {
  const approveId = encodeCustomId({
    feature: 'anon',
    action: 'approve',
    payload: {
      q: questionId
    }
  });

  const rejectId = encodeCustomId({
    feature: 'anon',
    action: 'reject',
    payload: {
      q: questionId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approveId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(rejectId).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}

export function buildRaidClaimButton(questKey: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'claim',
    payload: {
      q: questKey
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Claim').setStyle(ButtonStyle.Primary),
  );
}

export function buildRaidConfirmButton(claimId: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'confirm',
    payload: {
      c: claimId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Partner confirm').setStyle(ButtonStyle.Success),
  );
}
