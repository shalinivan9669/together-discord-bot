import { separator, textBlock, uiCard, type ComponentsV2Message } from '../ui-v2';
import type { MonthlyHallSnapshot, MonthlyHallTopPairRow } from '../../app/services/monthlyHallService';

function formatTopPairs(title: string, rows: MonthlyHallTopPairRow[], unit: string): string {
  if (rows.length === 0) {
    return `${title}: no opt-in entries this month.`;
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
        title: 'Monthly Hall of Harmony',
        status: `${snapshot.monthLabel} (${snapshot.monthKey})`,
        accentColor: 0x2f7d6d,
        components: [
          textBlock(
            `Active pairs: **${snapshot.activePairs}**\n` +
            `Check-ins done: **${snapshot.checkinsDone}**\n` +
            `Raid participation: **${snapshot.raidParticipation}** pair(s)\n` +
            `Duel participation: **${snapshot.duelParticipation}** pair(s)`,
          ),
          separator(),
          textBlock(formatTopPairs('Top check-in consistency', snapshot.topCheckinPairs, 'check-in(s)')),
          separator(),
          textBlock(formatTopPairs('Top raid points', snapshot.topRaidPairs, 'point(s)')),
          separator(),
          textBlock(formatTopPairs('Top duel activity', snapshot.topDuelPairs, 'submission(s)')),
          separator(),
          textBlock(
            `Updated: <t:${Math.floor(snapshot.generatedAt.getTime() / 1000)}:R>\n` +
            'Only users who opt in are shown in tops. No negative rankings are posted.',
          )
        ]
      })
    ]
  };
}
