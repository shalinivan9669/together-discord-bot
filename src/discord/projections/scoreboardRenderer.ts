import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { DuelScoreboardSnapshot } from '../../app/services/duelService';
import { encodeCustomId } from '../interactions/customId';

function standingsLines(snapshot: DuelScoreboardSnapshot): string {
  const top = snapshot.topPairs.slice(0, 5);
  if (top.length === 0) {
    return 'Top 5: no submissions yet.';
  }

  const rows = top.map(
    (row, idx) => `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> — **${row.points}** pts`,
  );
  return ['Top 5', ...rows].join('\n');
}

function roundStatus(snapshot: DuelScoreboardSnapshot): string {
  if (!snapshot.roundNo) {
    return 'Round: _not started_';
  }

  const endsAt = snapshot.roundEndsAt
    ? ` • ends <t:${Math.floor(snapshot.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  return `Round #${snapshot.roundNo}: **${snapshot.roundStatus}**${endsAt}`;
}

export function renderDuelScoreboard(snapshot: DuelScoreboardSnapshot): ComponentsV2Message {
  const rulesId = encodeCustomId({
    feature: 'duel_board',
    action: 'rules',
    payload: { d: snapshot.duelId }
  });

  const participateId = encodeCustomId({
    feature: 'duel_board',
    action: 'how',
    payload: { d: snapshot.duelId }
  });

  const myRoomId = encodeCustomId({
    feature: 'duel_board',
    action: 'open_room',
    payload: { d: snapshot.duelId }
  });

  const contributionId = encodeCustomId({
    feature: 'duel_board',
    action: 'my_contribution',
    payload: { d: snapshot.duelId }
  });

  return {
    components: [
      uiCard({
        title: 'Butler Duel Scoreboard',
        status: snapshot.status,
        accentColor: 0xc44536,
        components: [
          textBlock(`${roundStatus(snapshot)}\nPairs tracked: **${snapshot.totalPairs}**`),
          separator(),
          textBlock(standingsLines(snapshot)),
          separator(),
          textBlock(
            `Submissions: **${snapshot.totalSubmissions}**\nUpdated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`,
          ),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Rules'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: participateId,
              label: 'How'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: myRoomId,
              label: 'Open my room'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: contributionId,
              label: 'My contribution'
            }
          ])
        ]
      })
    ]
  };
}
