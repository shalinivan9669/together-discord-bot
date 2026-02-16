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

function duelSummary(snapshot: PairHomeSnapshot): string {
  if (!snapshot.duel.active) {
    return 'Duel: no active duel.';
  }

  if (!snapshot.duel.roundNo || !snapshot.duel.roundId) {
    return 'Duel: active, waiting for the next round.';
  }

  const endsPart = snapshot.duel.roundEndsAt
    ? ` • ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  const submitState = snapshot.duel.submittedThisRound ? 'submitted' : 'waiting for submission';
  return `Duel round #${snapshot.duel.roundNo}: **${submitState}**${endsPart}`;
}

function duelCta(snapshot: PairHomeSnapshot): {
  customId: string;
  label: string;
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
} {
  if (snapshot.duel.active && snapshot.duel.roundId && snapshot.duel.duelId && !snapshot.duel.submittedThisRound) {
    return {
      customId: encodeCustomId({
        feature: 'duel',
        action: 'open_submit_modal',
        payload: {
          duelId: snapshot.duel.duelId,
          roundId: snapshot.duel.roundId,
          pairId: snapshot.pairId
        }
      }),
      label: 'Submit duel answer',
      style: ButtonStyle.Primary
    };
  }

  return {
    customId: encodeCustomId({
      feature: 'pair_home',
      action: 'duel_info',
      payload: {
        p: snapshot.pairId
      }
    }),
    label: 'Duel status',
    style: ButtonStyle.Secondary
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

  const duelButton = duelCta(snapshot);

  const raidLine = snapshot.raid.active
    ? `Raid points today: **${snapshot.raid.pointsToday}/${snapshot.raid.dailyCap}**`
    : 'Raid points today: no active raid.';

  const contextButtons: Array<{
    type: ComponentType.Button;
    style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
    custom_id: string;
    label: string;
  }> = [];

  if (snapshot.duel.active && snapshot.duel.duelId) {
    contextButtons.push(
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'duel_board',
          action: 'rules',
          payload: { d: snapshot.duel.duelId }
        }),
        label: 'Duel rules'
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'duel_board',
          action: 'how',
          payload: { d: snapshot.duel.duelId }
        }),
        label: 'Duel how'
      }
    );

    if (!snapshot.raid.active) {
      contextButtons.push({
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'duel_board',
          action: 'my_contribution',
          payload: { d: snapshot.duel.duelId }
        }),
        label: 'Duel contribution'
      });
    }
  }

  if (snapshot.raid.active && snapshot.raid.raidId) {
    contextButtons.push(
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'raid_board',
          action: 'rules',
          payload: { r: snapshot.raid.raidId }
        }),
        label: 'Raid rules'
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'raid_board',
          action: 'how',
          payload: { r: snapshot.raid.raidId }
        }),
        label: 'Raid how'
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: encodeCustomId({
          feature: 'raid_board',
          action: 'my_contribution',
          payload: { r: snapshot.raid.raidId }
        }),
        label: 'Raid contribution'
      }
    );
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
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: checkinId,
              label: 'Weekly check-in'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: raidId,
              label: 'Today quests'
            },
            {
              type: ComponentType.Button,
              style: duelButton.style,
              custom_id: duelButton.customId,
              label: duelButton.label
            }
          ]),
          ...(contextButtons.length > 0 ? [actionRowButtons(contextButtons.slice(0, 5))] : [])
        ]
      })
    ]
  };
}
