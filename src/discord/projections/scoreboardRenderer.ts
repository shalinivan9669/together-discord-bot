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
    return 'Топ-5: пока нет ответов.';
  }

  const rows = top.map(
    (row, idx) => `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> - **${row.points}** очк.`,
  );
  return ['Топ-5', ...rows].join('\n');
}

function duelStatusLabel(status: string): string {
  if (status === 'active') {
    return 'активна';
  }

  if (status === 'completed') {
    return 'завершена';
  }

  if (status === 'cancelled') {
    return 'отменена';
  }

  return status;
}

function roundStateLabel(status: string): string {
  if (status === 'active') {
    return 'активен';
  }

  if (status === 'closed') {
    return 'закрыт';
  }

  return status;
}

function roundStatus(snapshot: DuelScoreboardSnapshot): string {
  if (!snapshot.roundNo) {
    return 'Раунд: _не начат_';
  }

  const endsAt = snapshot.roundEndsAt
    ? ` - до <t:${Math.floor(snapshot.roundEndsAt.getTime() / 1000)}:R>`
    : '';

  return `Раунд #${snapshot.roundNo}: **${roundStateLabel(snapshot.roundStatus)}**${endsAt}`;
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

  return {
    components: [
      uiCard({
        title: 'Табло дуэли',
        status: duelStatusLabel(snapshot.status),
        accentColor: 0xc44536,
        components: [
          textBlock(`${roundStatus(snapshot)}\nПары в учёте: **${snapshot.totalPairs}**`),
          separator(),
          textBlock(standingsLines(snapshot)),
          separator(),
          textBlock(
            `Ответов: **${snapshot.totalSubmissions}**\nОбновлено: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`,
          ),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Правила'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: participateId,
              label: 'Как участвовать'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: myRoomId,
              label: 'Открыть мою комнату'
            }
          ])
        ]
      })
    ]
  };
}
