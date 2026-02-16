import type { DuelScoreboardSnapshot } from '../../app/services/duelService';

export function renderDuelScoreboard(snapshot: DuelScoreboardSnapshot): string {
  const lines: string[] = [];
  lines.push('## Butler Duel Scoreboard');
  lines.push(`Duel: \`${snapshot.duelId}\``);
  lines.push(`Status: **${snapshot.status}**`);

  if (snapshot.roundNo) {
    lines.push(`Round: **#${snapshot.roundNo}** (${snapshot.roundStatus})`);
  } else {
    lines.push('Round: _not started_');
  }

  if (snapshot.roundEndsAt) {
    lines.push(`Round ends: <t:${Math.floor(snapshot.roundEndsAt.getTime() / 1000)}:R>`);
  }

  lines.push(`Pairs tracked: **${snapshot.totalPairs}**`);
  lines.push(`Submissions: **${snapshot.totalSubmissions}**`);
  lines.push('');
  lines.push('### Standings');

  const standings = snapshot.topPairs.slice(0, 10);
  if (standings.length === 0) {
    lines.push('No pairs yet.');
  } else {
    standings.forEach((row, idx) => {
      lines.push(
        `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> — **${row.points}** pts (${row.submissions} submissions)`,
      );
    });
  }

  lines.push('');
  lines.push(`Last updated: ${snapshot.updatedAt.toISOString()}`);
  return lines.join('\n');
}