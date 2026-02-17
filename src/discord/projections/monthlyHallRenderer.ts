import { separator, textBlock, uiCard, type ComponentsV2Message } from '../ui-v2';
import type { MonthlyHallSnapshot, MonthlyHallTopPairRow } from '../../app/services/monthlyHallService';

function formatTopPairs(title: string, rows: MonthlyHallTopPairRow[], unit: string): string {
  if (rows.length === 0) {
    return `${title}: в этом месяце нет opt-in записей.`;
  }

  return [
    `${title} (opt-in)`,
    ...rows.map((row, idx) => `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> - **${row.value}** ${unit}`)
  ].join('\n');
}

export function renderMonthlyHallCard(snapshot: MonthlyHallSnapshot): ComponentsV2Message {
  return {
    components: [
      uiCard({
        title: 'Ежемесячный зал гармонии',
        status: `${snapshot.monthLabel} (${snapshot.monthKey})`,
        accentColor: 0x2f7d6d,
        components: [
          textBlock(
            `Активных пар: **${snapshot.activePairs}**\n` +
            `Чек-инов выполнено: **${snapshot.checkinsDone}**\n` +
            `Участие в рейде: **${snapshot.raidParticipation}** пар(ы)\n` +
            `Участие в дуэлях: **${snapshot.duelParticipation}** пар(ы)`,
          ),
          separator(),
          textBlock(formatTopPairs('Топ стабильности чек-инов', snapshot.topCheckinPairs, 'чек-ин(ов)')),
          separator(),
          textBlock(formatTopPairs('Топ очков рейда', snapshot.topRaidPairs, 'очк.')),
          separator(),
          textBlock(formatTopPairs('Топ активности в дуэлях', snapshot.topDuelPairs, 'ответ(ов)')),
          separator(),
          textBlock(
            `Обновлено: <t:${Math.floor(snapshot.generatedAt.getTime() / 1000)}:R>\n` +
            'В топах показываются только пользователи с opt-in. Негативные рейтинги не публикуются.',
          )
        ]
      })
    ]
  };
}
