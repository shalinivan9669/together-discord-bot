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
    return 'Duel: no active duel.';
  }

  if (!snapshot.duel.roundNo) {
    return 'Duel: active, waiting for the next round.';
  }

  const endsPart = snapshot.duel.roundEndsAt
    ? ` - ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  const state = snapshot.duel.submittedThisRound ? 'submitted' : 'ready to submit';
  return `Duel round #${snapshot.duel.roundNo}: **${state}**${endsPart}`;
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
      label: 'Duel submit'
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
    label: 'Duel submit'
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
    ? `Raid points today: **${snapshot.raid.pointsToday}/${snapshot.raid.dailyCap}**`
    : 'Raid points today: no active raid.';

  const primaryButtons: PairHomeButton[] = [
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: checkinId,
      label: 'Check-in'
    },
    {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      custom_id: raidId,
      label: 'Raid quests'
    }
  ];

  const duelCta = duelButton(snapshot);
  if (duelCta) {
    primaryButtons.push(duelCta);
  }

  return {
    components: [
      uiCard({
        title: 'Pair Home Panel',
        status: `${snapshot.user1Id} + ${snapshot.user2Id}`,
        accentColor: 0x4f8a3f,
        components: [
          textBlock(
            `Check-in this week (${snapshot.weekStartDate}): **${snapshot.checkinSubmitted ? 'submitted' : 'pending'}**\n${raidLine}\n${duelSummary(snapshot)}`,
          ),
          separator(),
          textBlock(`Updated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons(primaryButtons)
        ]
      })
    ]
  };
}
