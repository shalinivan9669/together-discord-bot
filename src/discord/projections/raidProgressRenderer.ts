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
    return 'Goal reached';
  }

  if (percent >= 75) {
    return 'Final push';
  }

  if (percent >= 40) {
    return 'Mid raid';
  }

  if (percent > 0) {
    return 'Momentum building';
  }

  return 'Kickoff';
}

function topPairsText(snapshot: RaidProgressSnapshot): string {
  const rows = snapshot.topPairs.slice(0, 5);
  if (rows.length === 0) {
    return 'Top 5 (opt-in): no confirmed claims yet.';
  }

  return [
    'Top 5 (opt-in)',
    ...rows.map(
      (pair, idx) => `${idx + 1}. <@${pair.user1Id}> + <@${pair.user2Id}> — **${pair.points}** pts`,
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
        title: 'Cooperative Raid Progress',
        status: snapshot.status,
        accentColor: 0x1e6f9f,
        components: [
          textBlock(
            `Goal: **${snapshot.goalPoints}** pts\nProgress: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)\nPhase: **${phaseLabel(percent)}**`,
          ),
          separator(),
          textBlock(
            `Week: \`${snapshot.weekStartDate}\` • ends <t:${Math.floor(snapshot.weekEndAt.getTime() / 1000)}:R>\nParticipants: **${snapshot.participantsCount}**`,
          ),
          separator(),
          textBlock(topPairsText(snapshot)),
          separator(),
          textBlock(`Updated: <t:${Math.floor(snapshot.updatedAt.getTime() / 1000)}:R>`),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: takeTodayId,
              label: 'Take today quests'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: contributionId,
              label: 'My contribution'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: rulesId,
              label: 'Rules'
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
    `Raid: \`${snapshot.raidId}\``,
    `Status: **${snapshot.status}**`,
    `Progress: **${snapshot.progressPoints}/${snapshot.goalPoints}** (${percent}%)`,
    `Participants: **${snapshot.participantsCount}**`
  ].join('\n');
}
