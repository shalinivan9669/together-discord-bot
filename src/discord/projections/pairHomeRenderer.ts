import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { PairHomeSnapshot } from '../../app/services/pairHomeService';
import { encodeCustomId } from '../interactions/customId';

type PairHomeButton = {
  type: ComponentType.Button;
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
  custom_id: string;
  label: string;
};

function duelSummary(snapshot: PairHomeSnapshot): string {
  if (!snapshot.duel.active) {
    return 'Дуэль: активной дуэли нет.';
  }

  if (!snapshot.duel.roundNo) {
    return 'Дуэль: активна, ждём следующий раунд.';
  }

  const endsPart = snapshot.duel.roundEndsAt
    ? ` - до <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  const state = snapshot.duel.submittedThisRound ? 'ответ отправлен' : 'можно отправлять ответ';
  return `Раунд дуэли #${snapshot.duel.roundNo}: **${state}**${endsPart}`;
}

function duelButton(snapshot: PairHomeSnapshot): PairHomeButton | null {
  if (!snapshot.duel.active || !snapshot.duel.roundId || !snapshot.duel.duelId) {
    return null;
  }

  if (!snapshot.duel.submittedThisRound) {
    return {
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      custom_id: encodeCustomId({
        feature: 'duel',
        action: 'open_submit_modal',
        payload: {
          duelId: snapshot.duel.duelId,
          roundId: snapshot.duel.roundId,
          pairId: snapshot.pairId
        }
      }),
      label: 'Ответ в дуэли'
    };
  }

  return {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    custom_id: encodeCustomId({
      feature: 'pair_home',
      action: 'duel_info',
      payload: { p: snapshot.pairId }
    }),
    label: 'Ответ в дуэли'
  };
}

export function renderPairHomePanel(snapshot: PairHomeSnapshot): ComponentsV2Message {
  const checkinId = encodeCustomId({
    feature: 'pair_home',
    action: 'checkin',
    payload: {
      p: snapshot.pairId
    }
  });

  const raidId = encodeCustomId({
    feature: 'pair_home',
    action: 'raid',
    payload: {
      p: snapshot.pairId
    }
  });

  const raidLine = snapshot.raid.active
    ? `Очки рейда сегодня: **${snapshot.raid.pointsToday}/${snapshot.raid.dailyCap}**`
    : 'Очки рейда сегодня: активного рейда нет.';

  const primaryButtons: PairHomeButton[] = [
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: checkinId,
      label: 'Чек-ин'
    },
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: raidId,
      label: 'Квесты рейда'
    }
  ];

  const duelCta = duelButton(snapshot);
  if (duelCta) {
    primaryButtons.push(duelCta);
  }

  return {
    components: [
      uiCard({
        title: 'Панель пары',
        status: `${snapshot.user1Id} + ${snapshot.user2Id}`,
        accentColor: 0x4f8a3f,
        components: [
          textBlock(
            `Чек-ин за неделю (${snapshot.weekStartDate}): **${snapshot.checkinSubmitted ? 'отправлен' : 'ожидается'}**\n${raidLine}\n${duelSummary(snapshot)}`,
          ),
          separator(),
          textBlock(`Обновлено: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons(primaryButtons)
        ]
      })
    ]
  };
}
