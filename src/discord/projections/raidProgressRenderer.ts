import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import type { RaidProgressSnapshot } from '../../app/services/raidService';
import { encodeCustomId } from '../interactions/customId';

function completionPercent(snapshot: RaidProgressSnapshot): number {
  if (snapshot.goalPoints <= 0) {
    return 0;
  }

  return Math.min(100, Math.floor((snapshot.progressPoints / snapshot.goalPoints) * 100));
}

function phaseLabel(percent: number): string {
  if (percent >= 100) {
    return 'Цель достигнута';
  }

  if (percent >= 75) {
    return 'Финальный рывок';
  }

  if (percent >= 40) {
    return 'Середина рейда';
  }

  if (percent > 0) {
    return 'Набираем темп';
  }

  return 'Старт';
}

function raidStatusLabel(status: string): string {
  if (status === 'active') {
    return 'активен';
  }

  if (status === 'completed') {
    return 'завершён';
  }

  if (status === 'cancelled') {
    return 'отменён';
  }

  return status;
}

function topPairsText(snapshot: RaidProgressSnapshot): string {
  const rows = snapshot.topPairs.slice(0, 5);
  if (rows.length === 0) {
    return 'Топ-5 (opt-in): пока нет подтверждённых квестов.';
  }

  return [
    'Топ-5 (opt-in)',
    ...rows.map(
      (pair, idx) => `${idx + 1}. <@${pair.user1Id}> + <@${pair.user2Id}> - **${pair.points}** очк.`,
    )
  ].join('\n');
}

export function renderRaidProgress(snapshot: RaidProgressSnapshot): ComponentsV2Message {
  const percent = completionPercent(snapshot);

  const takeTodayId = encodeCustomId({
    feature: 'raid_board',
    action: 'take_quests',
    payload: { r: snapshot.raidId }
  });

  const contributionId = encodeCustomId({
    feature: 'raid_board',
    action: 'my_contribution',
    payload: { r: snapshot.raidId }
  });

  const rulesId = encodeCustomId({
    feature: 'raid_board',
    action: 'rules',
    payload: { r: snapshot.raidId }
  });

  return {
    components: [
      uiCard({
        title: 'Прогресс рейда сервера',
        status: raidStatusLabel(snapshot.status),
        accentColor: 0x1e6f9f,
        components: [
          textBlock(
            `Цель: **${snapshot.goalPoints}** очк.\nПрогресс: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)\nЭтап: **${phaseLabel(percent)}**`,
          ),
          separator(),
          textBlock(
            `Неделя: \`${snapshot.weekStartDate}\` - до <t:${Math.floor(snapshot.weekEndAt.getTime() / 1000)}:R>\nУчастников: **${snapshot.participantsCount}**`,
          ),
          separator(),
          textBlock(topPairsText(snapshot)),
          separator(),
          textBlock(`Обновлено: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: takeTodayId,
              label: 'Взять квесты'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: contributionId,
              label: 'Мой вклад'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Правила'
            }
          ])
        ]
      })
    ]
  };
}

export function renderRaidProgressText(snapshot: RaidProgressSnapshot): string {
  const percent = completionPercent(snapshot);
  return [
    `Рейд: \`${snapshot.raidId}\``,
    `Статус: **${raidStatusLabel(snapshot.status)}**`,
    `Прогресс: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)`,
    `Участников: **${snapshot.participantsCount}**`
  ].join('\n');
}
