import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  dateBudgetValues,
  dateEnergyValues,
  dateTimeValues,
  type DateBudget,
  type DateEnergy,
  type DateTimeWindow,
} from '../../domain/date';
import { t, type AppLocale } from '../../i18n';
import { encodeCustomId } from './customId';

type SayTone = 'soft' | 'direct' | 'short';
type OracleMode = 'soft' | 'neutral' | 'hard';
type OracleContext = 'conflict' | 'ok' | 'boredom' | 'distance' | 'fatigue' | 'jealousy';

function datePayload(filters: { energy: DateEnergy; budget: DateBudget; timeWindow: DateTimeWindow }) {
  return {
    e: filters.energy,
    b: filters.budget,
    t: filters.timeWindow
  };
}

export function buildDuelSubmitButton(
  params: { duelId: string; roundId: string; pairId: string },
  locale: AppLocale = 'ru',
) {
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
    new ButtonBuilder().setCustomId(customId).setLabel(t(locale, 'component.duel.submit_answer')).setStyle(ButtonStyle.Primary),
  );
}

export function buildDuelSubmissionModal(
  params: { duelId: string; roundId: string; pairId: string },
  locale: AppLocale = 'ru',
) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle(t(locale, 'component.duel.modal.title'));

  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel(t(locale, 'component.duel.modal.answer_label'))
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(400)
    .setRequired(true)
    .setPlaceholder(t(locale, 'component.duel.modal.answer_placeholder'));

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
  return modal;
}

const oracleModes: readonly OracleMode[] = ['soft', 'neutral', 'hard'];
const oracleContexts: readonly OracleContext[] = ['conflict', 'ok', 'boredom', 'distance', 'fatigue', 'jealousy'];

export function buildOracleClaimPicker(params: {
  guildId: string;
  weekStartDate: string;
  mode: OracleMode;
  context: OracleContext;
}, locale: AppLocale = 'ru') {
  const modeSelectId = encodeCustomId({
    feature: 'oracle',
    action: 'pick_mode',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  const contextSelectId = encodeCustomId({
    feature: 'oracle',
    action: 'pick_context',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  const claimButtonId = encodeCustomId({
    feature: 'oracle',
    action: 'claim_submit',
    payload: {
      g: params.guildId,
      w: params.weekStartDate,
      m: params.mode,
      c: params.context
    }
  });

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(modeSelectId)
        .setPlaceholder(t(locale, 'component.oracle.select_mode'))
        .addOptions(
          oracleModes.map((mode) => ({
            label: t(locale, `component.oracle.mode.${mode}` as const),
            value: mode,
            default: mode === params.mode
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(contextSelectId)
        .setPlaceholder(t(locale, 'component.oracle.select_context'))
        .addOptions(
          oracleContexts.map((context) => ({
            label: t(locale, `component.oracle.context.${context}` as const),
            value: context,
            default: context === params.context
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(claimButtonId).setLabel(t(locale, 'component.oracle.get_privately')).setStyle(ButtonStyle.Primary),
    )
  ];
}

export function buildCheckinAgreementSelect(
  options: Array<{ key: string; text: string }>,
  locale: AppLocale = 'ru',
) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'agreement_select',
    payload: {}
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(t(locale, 'component.checkin.select_agreement'))
    .addOptions(
      options.map((item) => ({
        label: item.text.slice(0, 100),
        description: item.key,
        value: item.key
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCheckinSubmitModal(agreementKey: string, locale: AppLocale = 'ru') {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'submit_modal',
    payload: {
      a: agreementKey
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle(t(locale, 'component.checkin.modal.title'));

  const fields = [
    { id: 's1', label: t(locale, 'component.checkin.modal.s1') },
    { id: 's2', label: t(locale, 'component.checkin.modal.s2') },
    { id: 's3', label: t(locale, 'component.checkin.modal.s3') },
    { id: 's4', label: t(locale, 'component.checkin.modal.s4') },
    { id: 's5', label: t(locale, 'component.checkin.modal.s5') }
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

export function buildCheckinShareButton(checkinId: string, locale: AppLocale = 'ru') {
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
      .setLabel(t(locale, 'component.checkin.share_public'))
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildAnonAskModal(guildId: string, locale: AppLocale = 'ru') {
  const modal = new ModalBuilder()
    .setTitle(t(locale, 'component.anon.ask.modal_title'))
    .setCustomId(
      encodeCustomId({
        feature: 'anon',
        action: 'ask_modal',
        payload: { g: guildId }
      }),
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('question')
          .setLabel(t(locale, 'component.anon.ask.question_label'))
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(400)
          .setRequired(true),
      ),
    );

  return modal;
}

export function buildAnonModerationButtons(questionId: string, locale: AppLocale = 'ru') {
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
    new ButtonBuilder().setCustomId(approveId).setLabel(t(locale, 'component.anon.approve')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(rejectId).setLabel(t(locale, 'component.anon.reject')).setStyle(ButtonStyle.Danger),
  );
}

export function buildAnonQueuePaginationButtons(params: {
  page: number;
  totalPages: number;
}, locale: AppLocale = 'ru') {
  const prevPage = Math.max(0, params.page - 1);
  const nextPage = Math.min(Math.max(0, params.totalPages - 1), params.page + 1);

  const prevId = encodeCustomId({
    feature: 'anon_queue',
    action: 'page',
    payload: { p: String(prevPage) }
  });

  const nextId = encodeCustomId({
    feature: 'anon_queue',
    action: 'page',
    payload: { p: String(nextPage) }
  });

  const markerId = encodeCustomId({
    feature: 'anon_queue',
    action: 'noop',
    payload: { p: String(params.page) }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel(t(locale, 'component.anon.prev'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(params.page <= 0),
    new ButtonBuilder()
      .setCustomId(markerId)
      .setLabel(
        t(locale, 'component.anon.page', {
          page: params.page + 1,
          total: Math.max(1, params.totalPages)
        }),
      )
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel(t(locale, 'component.anon.next'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(params.page >= Math.max(0, params.totalPages - 1)),
  );
}

export function buildAnonPublishedButtons(questionId: string, locale: AppLocale = 'ru') {
  const mascotAnswerId = encodeCustomId({
    feature: 'anon_qotd',
    action: 'mascot_answer',
    payload: {
      q: questionId
    }
  });

  const proposeId = encodeCustomId({
    feature: 'anon_qotd',
    action: 'propose_question',
    payload: {
      q: questionId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(mascotAnswerId).setLabel(t(locale, 'component.anon.mascot_answer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(proposeId).setLabel(t(locale, 'component.anon.propose_question')).setStyle(ButtonStyle.Primary),
  );
}

export function buildMediatorSayModal(guildId: string, locale: AppLocale = 'ru') {
  const customId = encodeCustomId({
    feature: 'mediator',
    action: 'say_submit',
    payload: {
      g: guildId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle(t(locale, 'component.mediator.say.modal_title'));

  const message = new TextInputBuilder()
    .setCustomId('source')
    .setLabel(t(locale, 'component.mediator.say.source_label'))
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(320)
    .setRequired(true)
    .setPlaceholder(t(locale, 'component.mediator.say.source_placeholder'));

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(message));
  return modal;
}

export function buildMediatorSayToneButtons(params: {
  sessionId: string;
  selectedTone: SayTone;
  canSendToPairRoom: boolean;
  alreadySent: boolean;
}, locale: AppLocale = 'ru') {
  const toneButton = (tone: SayTone, label: string) =>
    new ButtonBuilder()
      .setCustomId(
        encodeCustomId({
          feature: 'mediator',
          action: `say_tone_${tone}`,
          payload: {
            s: params.sessionId
          }
        }),
      )
      .setLabel(label)
      .setStyle(params.selectedTone === tone ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const sendId = encodeCustomId({
    feature: 'mediator',
    action: 'say_send_pair',
    payload: {
      s: params.sessionId
    }
  });

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      toneButton('soft', t(locale, 'component.mediator.say.tone.soft')),
      toneButton('direct', t(locale, 'component.mediator.say.tone.direct')),
      toneButton('short', t(locale, 'component.mediator.say.tone.short')),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(sendId)
        .setLabel(t(locale, 'component.mediator.say.send_pair'))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!params.canSendToPairRoom || params.alreadySent),
    )
  ];
}

export function buildDateGeneratorPicker(filters: {
  energy: DateEnergy;
  budget: DateBudget;
  timeWindow: DateTimeWindow;
}, locale: AppLocale = 'ru') {
  const energySelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_energy',
    payload: datePayload(filters)
  });

  const budgetSelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_budget',
    payload: datePayload(filters)
  });

  const timeSelectId = encodeCustomId({
    feature: 'date',
    action: 'pick_time',
    payload: datePayload(filters)
  });

  const generateId = encodeCustomId({
    feature: 'date',
    action: 'generate_ideas',
    payload: datePayload(filters)
  });

  const energyOptions: Record<DateEnergy, string> = {
    low: t(locale, 'date.energy.low'),
    medium: t(locale, 'date.energy.medium'),
    high: t(locale, 'date.energy.high')
  };

  const budgetOptions: Record<DateBudget, string> = {
    free: t(locale, 'date.budget.free'),
    moderate: t(locale, 'date.budget.moderate'),
    splurge: t(locale, 'date.budget.splurge')
  };

  const timeOptions: Record<DateTimeWindow, string> = {
    quick: t(locale, 'date.time.quick'),
    evening: t(locale, 'date.time.evening'),
    halfday: t(locale, 'date.time.halfday')
  };

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(energySelectId)
        .setPlaceholder(t(locale, 'component.date.select_energy'))
        .addOptions(
          dateEnergyValues.map((value) => ({
            label: energyOptions[value],
            value,
            default: value === filters.energy
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(budgetSelectId)
        .setPlaceholder(t(locale, 'component.date.select_budget'))
        .addOptions(
          dateBudgetValues.map((value) => ({
            label: budgetOptions[value],
            value,
            default: value === filters.budget
          })),
        ),
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(timeSelectId)
        .setPlaceholder(t(locale, 'component.date.select_time'))
        .addOptions(
          dateTimeValues.map((value) => ({
            label: timeOptions[value],
            value,
            default: value === filters.timeWindow
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(generateId).setLabel(t(locale, 'component.date.generate')).setStyle(ButtonStyle.Primary),
    )
  ];
}

export function buildRaidClaimButton(questKey: string, locale: AppLocale = 'ru') {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'claim',
    payload: {
      q: questKey
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(t(locale, 'component.raid.claim')).setStyle(ButtonStyle.Primary),
  );
}

export function buildRaidConfirmButton(claimId: string, locale: AppLocale = 'ru') {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'confirm',
    payload: {
      c: claimId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(t(locale, 'component.raid.partner_confirm')).setStyle(ButtonStyle.Success),
  );
}

