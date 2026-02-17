# Step 1 Changed Files (Full Content)

## docs/UX_PLAN.md
```md
# UX Plan (Steps 1-3)

## Scope
- This document tracks the phased UX implementation for the Discord bot interface model.
- Step 1 is implemented in code in this repo.
- Steps 2 and 3 are implementation plans only.

## UX Rules (Global)

### Public Dashboards
- Every dashboard is one persistent public message per loop context.
- Never post duplicates for normal state changes.
- All updates must flow through the throttled message editor and queue jobs.
- Public interactions should answer with ephemeral helper replies where possible.

### Pair Home Panel
- Each pair room has exactly one bot-owned panel message.
- The message is edited in place on state changes.
- Pinning is best-effort and attempted once only.
- Panel must stay compact: status summary + exactly 3 CTA buttons.

### Ephemeral Wizards
- Setup and admin workflows should be ephemeral by default.
- Interactions must acknowledge quickly (`defer*` within 3s).
- Save actions write to durable storage (`guild_settings`) and refresh panel state.
- Test actions must be idempotent and queue-driven.

## Step 1 (Implemented)

### 1. Components V2 Foundation
- Added `src/discord/ui-v2/` helper kit for:
  - standardized `uiCard` container wrapper
  - `textBlock`, `section`, `separator`
  - `actionRowButtons`, `actionRowSelects`
  - strict text truncation guard for text display content
- Added REST V2 helpers:
  - create/edit payload builders with `IsComponentsV2` flag
  - helper to send V2 messages directly

### 2. Public Dashboards Converted to V2
- Duel scoreboard now renders as V2 container with:
  - title/status
  - round state
  - top-5
  - submitted count
  - updated timestamp
  - buttons: Rules / How to participate / Open my room
- Raid progress now renders as V2 container with:
  - goal + progress + percent
  - phase label
  - participants count
  - top-5
  - buttons: Take today quests / My contribution / Rules
- Weekly oracle public post now renders as V2 container with:
  - header + teaser
  - buttons: Get privately / About / Start pair ritual

### 3. Pair Home Panel
- Added pair storage fields for panel lifecycle:
  - `pairs.pair_home_message_id`
  - `pairs.pair_home_pinned_at`
  - `pairs.pair_home_pin_attempted_at`
- Added debounced queue job `pair.home.refresh`.
- Panel includes:
  - weekly check-in status
  - raid points today `X/Y`
  - duel state + round CTA
  - exactly 3 CTA buttons
- Refresh triggers wired for:
  - check-in saved
  - raid claim confirmed
  - duel round started
  - duel submission accepted

### 4. `/setup` Ephemeral Wizard
- `/setup` now opens an ephemeral setup panel.
- Wizard controls:
  - Channel Selects: duel/oracle/questions/raid
  - Role Select: moderator role
  - Buttons: Save / Reset / Test Post
- Save persists to `guild_settings`.
- Test Post uses `scheduled_posts` + queue publish and idempotency windowing.

## Step 2 (Plan)

### UX Goals
- Improve contextual guidance and reduce confusion in first-time onboarding.
- Add lightweight confirmation UX for destructive/moderator actions.

### Planned Work
- Add contextual hint blocks to pair panel and public dashboards (state-driven).
- Add optional "why disabled" explanations on CTA responses.
- Add stable micro-copy catalog for repeated UX strings.
- Add telemetry dimensions for button usage and drop-off points.

### Reliability Constraints
- Keep single-message public dashboards unchanged.
- Keep app/domain layers Discord-type free.
- Keep all heavy actions queue-backed.

## Step 3 (Plan)

### UX Goals
- Build richer loop continuity without adding channel spam.
- Improve seasonal and rewards discoverability from existing surfaces.

### Planned Work
- Add progressive unlock indicators in pair panel/public dashboard copy.
- Add season-aware CTA routing (without introducing extra public posts).
- Add admin diagnostics panel for configured channels and projection health.
- Add UX snapshots/tests for core message payloads (golden render checks).

### Hard Constraints
- No Message Content intent.
- No arbitrary message reads.
- Continue idempotency-first writes with DB constraints + transactions + locks where needed.

```

## docs/COMPONENTS_V2_PATTERNS.md
```md
# Components V2 Patterns

This repo uses raw Discord API Components V2 payloads through `src/discord/ui-v2/`.

## Core Principles
- Use one `Container` card for each logical surface.
- Keep public loop surfaces to one edited message.
- Use concise, scannable `TextDisplay` blocks.
- Prefer ephemeral replies for button help/details.

## Do
- Build cards via `uiCard(...)` for consistent headers and accent styling.
- Use `textBlock(...)` for all text content (automatic truncation guard).
- Use `separator()` to break dense content sections.
- Keep action rows purposeful:
  - one row for dashboard CTA groups
  - one row per select control in setup wizard
- Set `MessageFlags.IsComponentsV2` when creating/editing V2 messages.

## DonвЂ™t
- DonвЂ™t mix spammy follow-up public posts for normal state updates.
- DonвЂ™t bypass `ThrottledMessageEditor` for projection edits.
- DonвЂ™t encode unvalidated payloads directly from user input.
- DonвЂ™t place long prose into one giant text block.

## Examples

### Duel scoreboard card
```ts
const view = renderDuelScoreboard(snapshot);
await messageEditor.queueEdit({
  channelId: snapshot.publicChannelId,
  messageId: snapshot.scoreboardMessageId,
  content: view.content ?? null,
  components: view.components,
  flags: COMPONENTS_V2_FLAGS,
});
```

### Weekly oracle V2 post
```ts
const message = renderWeeklyOraclePost({ guildId, weekStartDate });
await sendComponentsV2Message(client, channelId, message);
```

### Setup wizard panel
```ts
const panel = renderSetupWizardPanel(draft);
await interaction.editReply({
  content: panel.content ?? null,
  components: panel.components as never,
  flags: COMPONENTS_V2_FLAGS,
} as never);
```

## Custom ID Pattern
- Encode every interactive control with `encodeCustomId`.
- Keep `feature/action/payload` compact.
- Validate `action` and payload shape with `zod` in handlers.

## Text Guard Pattern
- `textBlock` applies safe truncation for `TextDisplay` limits.
- Use short structured lines instead of long paragraphs.

```

## src/discord/ui-v2/api.ts
```ts
export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  StringSelect = 3,
  TextInput = 4,
  UserSelect = 5,
  RoleSelect = 6,
  MentionableSelect = 7,
  ChannelSelect = 8,
  Section = 9,
  TextDisplay = 10,
  Thumbnail = 11,
  MediaGallery = 12,
  File = 13,
  Separator = 14,
  Container = 17,
}

export enum ButtonStyle {
  Primary = 1,
  Secondary = 2,
  Success = 3,
  Danger = 4,
  Link = 5,
  Premium = 6,
}

export enum MessageFlags {
  IsComponentsV2 = 32768,
}

export enum SeparatorSpacingSize {
  Small = 1,
  Large = 2,
}

export enum ChannelType {
  GuildText = 0,
  GuildAnnouncement = 5,
}

export type APIButtonComponent = {
  type: ComponentType.Button;
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
  custom_id: string;
  label?: string;
  disabled?: boolean;
};

export type APIChannelSelectComponent = {
  type: ComponentType.ChannelSelect;
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  channel_types?: ChannelType[];
};

export type APIRoleSelectComponent = {
  type: ComponentType.RoleSelect;
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
};

export type APISelectMenuComponent = APIChannelSelectComponent | APIRoleSelectComponent;

export type APIActionRowComponent<TComponent> = {
  type: ComponentType.ActionRow;
  components: TComponent[];
};

export type APITextDisplayComponent = {
  type: ComponentType.TextDisplay;
  content: string;
};

export type APIThumbnailComponent = {
  type: ComponentType.Thumbnail;
  media: { url: string };
  description?: string | null;
  spoiler?: boolean;
};

export type APISectionAccessoryComponent = APIButtonComponent | APIThumbnailComponent;

export type APISectionComponent = {
  type: ComponentType.Section;
  components: APITextDisplayComponent[];
  accessory: APISectionAccessoryComponent;
};

export type APISeparatorComponent = {
  type: ComponentType.Separator;
  divider?: boolean;
  spacing?: SeparatorSpacingSize;
};

export type APIMediaGalleryComponent = {
  type: ComponentType.MediaGallery;
  items: Array<{ media: { url: string }; description?: string }>;
};

export type APIComponentInMessageActionRow = APIButtonComponent | APISelectMenuComponent;

export type APIComponentInContainer =
  | APIActionRowComponent<APIComponentInMessageActionRow>
  | APITextDisplayComponent
  | APISectionComponent
  | APISeparatorComponent
  | APIMediaGalleryComponent;

export type APIContainerComponent = {
  type: ComponentType.Container;
  accent_color?: number | null;
  spoiler?: boolean;
  components: APIComponentInContainer[];
};

export type APIMessageTopLevelComponent =
  | APIContainerComponent
  | APIActionRowComponent<APIComponentInMessageActionRow>
  | APITextDisplayComponent
  | APISectionComponent
  | APISeparatorComponent
  | APIMediaGalleryComponent;

export type RESTPostAPIChannelMessageJSONBody = {
  content?: string;
  components?: APIMessageTopLevelComponent[];
  flags?: number;
};

export type RESTPatchAPIChannelMessageJSONBody = {
  content?: string | null;
  components?: APIMessageTopLevelComponent[];
  flags?: number | null;
};

export type APIMessage = {
  id: string;
};

export const Routes = {
  channelMessages(channelId: string): `/${string}` {
    return `/channels/${channelId}/messages`;
  },
  channelMessage(channelId: string, messageId: string): `/${string}` {
    return `/channels/${channelId}/messages/${messageId}`;
  }
};

```

## src/discord/ui-v2/kit.ts
```ts
import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  SeparatorSpacingSize,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInContainer,
  type APIContainerComponent,
  type APISectionAccessoryComponent,
  type APISectionComponent,
  type APISelectMenuComponent,
  type APISeparatorComponent,
  type APITextDisplayComponent,
} from './api';

const DEFAULT_CARD_ACCENT = 0x2f7d6d;
const MAX_TEXT_DISPLAY_LENGTH = 4000;
const MAX_SECTION_BLOCKS = 3;

function truncateSafe(value: string, maxLength: number): string {
  const chars = [...value];
  if (chars.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return chars.slice(0, maxLength).join('');
  }

  return `${chars.slice(0, maxLength - 1).join('')}РІР‚В¦`;
}

export function safeTextDisplayContent(value: string): string {
  return truncateSafe(value, MAX_TEXT_DISPLAY_LENGTH);
}

export function textBlock(content: string): APITextDisplayComponent {
  return {
    type: ComponentType.TextDisplay,
    content: safeTextDisplayContent(content)
  };
}

export function section(params: {
  text: string | string[];
  accessory: APISectionAccessoryComponent;
}): APISectionComponent {
  const lines = Array.isArray(params.text) ? params.text : [params.text];

  return {
    type: ComponentType.Section,
    components: lines.slice(0, MAX_SECTION_BLOCKS).map((line) => textBlock(line)),
    accessory: params.accessory
  };
}

export function separator(params?: {
  divider?: boolean;
  spacing?: SeparatorSpacingSize;
}): APISeparatorComponent {
  return {
    type: ComponentType.Separator,
    divider: params?.divider,
    spacing: params?.spacing
  };
}

export function uiCard(params: {
  title: string;
  status?: string;
  accentColor?: number;
  components: APIComponentInContainer[];
}): APIContainerComponent {
  const headerLines = [
    `## ${truncateSafe(params.title.trim(), 120)}`,
    params.status ? `Status: **${truncateSafe(params.status.trim(), 80)}**` : null
  ].filter((value): value is string => Boolean(value));

  return {
    type: ComponentType.Container,
    accent_color: params.accentColor ?? DEFAULT_CARD_ACCENT,
    components: [
      textBlock(headerLines.join('\n')),
      ...params.components
    ].slice(0, 10)
  };
}

export function actionRowButtons(
  buttons: APIButtonComponent[],
): APIActionRowComponent<APIButtonComponent> {
  return {
    type: ComponentType.ActionRow,
    components: buttons.slice(0, 5)
  };
}

export function actionRowSelects(
  selects: APISelectMenuComponent[],
): APIActionRowComponent<APISelectMenuComponent> {
  return {
    type: ComponentType.ActionRow,
    components: selects.slice(0, 1)
  };
}

export { ButtonStyle, ChannelType, ComponentType, SeparatorSpacingSize };

```

## src/discord/ui-v2/message.ts
```ts
import type { Client } from 'discord.js';
import {
  MessageFlags,
  Routes,
  type APIMessage,
  type APIMessageTopLevelComponent,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPostAPIChannelMessageJSONBody,
} from './api';

export const COMPONENTS_V2_FLAGS = MessageFlags.IsComponentsV2;

export type ComponentsV2Message = {
  components: APIMessageTopLevelComponent[];
  content?: string;
};

export type ComponentsV2Edit = {
  components?: APIMessageTopLevelComponent[];
  content?: string | null;
};

export function toComponentsV2CreateBody(message: ComponentsV2Message): RESTPostAPIChannelMessageJSONBody {
  return {
    content: message.content,
    components: message.components,
    flags: COMPONENTS_V2_FLAGS
  };
}

export function toComponentsV2EditBody(message: ComponentsV2Edit): RESTPatchAPIChannelMessageJSONBody {
  return {
    content: message.content,
    components: message.components,
    flags: COMPONENTS_V2_FLAGS
  };
}

export async function sendComponentsV2Message(
  client: Client,
  channelId: string,
  message: ComponentsV2Message,
): Promise<{ id: string }> {
  const created = await client.rest.post(Routes.channelMessages(channelId), {
    body: toComponentsV2CreateBody(message)
  }) as APIMessage;

  return { id: created.id };
}

```

## src/discord/ui-v2/index.ts
```ts
export * from './kit';
export * from './message';

```

## src/discord/projections/messageEditor.ts
```ts
import { setTimeout as sleep } from 'node:timers/promises';
import type { Client } from 'discord.js';
import {
  Routes,
  type APIMessageTopLevelComponent,
  type RESTPatchAPIChannelMessageJSONBody,
} from '../ui-v2/api';
import { logger } from '../../lib/logger';

export type EditPayload = {
  channelId: string;
  messageId: string;
  content?: string | null;
  components?: APIMessageTopLevelComponent[];
  flags?: number;
};

type Slot = {
  lastEditedAt: number;
  inFlight: Promise<void> | null;
  pending: EditPayload | null;
};

export class ThrottledMessageEditor {
  private readonly slots = new Map<string, Slot>();

  constructor(
    private readonly client: Client,
    private readonly throttleSeconds: number,
  ) {}

  async queueEdit(payload: EditPayload): Promise<void> {
    const key = `${payload.channelId}:${payload.messageId}`;
    const slot = this.slots.get(key) ?? {
      lastEditedAt: 0,
      inFlight: null,
      pending: null
    };

    slot.pending = payload;

    if (!slot.inFlight) {
      slot.inFlight = this.processKey(key, slot).finally(() => {
        slot.inFlight = null;
        if (!slot.pending) {
          this.slots.delete(key);
        }
      });
    }

    this.slots.set(key, slot);
    await slot.inFlight;
  }

  private async processKey(key: string, slot: Slot): Promise<void> {
    while (slot.pending) {
      const next = slot.pending;
      slot.pending = null;

      const waitMs = Math.max(0, slot.lastEditedAt + this.throttleSeconds * 1000 - Date.now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      await this.editWithRetry(next);
      slot.lastEditedAt = Date.now();
    }

    logger.debug({ feature: 'projection.message_editor', key }, 'Edit queue drained');
  }

  private async editWithRetry(payload: EditPayload): Promise<void> {
    const maxAttempts = 4;

    const body: RESTPatchAPIChannelMessageJSONBody = {};
    if (payload.content !== undefined) {
      body.content = payload.content;
    }
    if (payload.components !== undefined) {
      body.components = payload.components;
    }
    if (payload.flags !== undefined) {
      body.flags = payload.flags;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.client.rest.patch(Routes.channelMessage(payload.channelId, payload.messageId), {
          body
        });
        return;
      } catch (error) {
        const anyError = error as { status?: number; data?: { retry_after?: number } };
        const retryAfterSeconds = anyError.data?.retry_after;

        if ((anyError.status === 429 || retryAfterSeconds) && attempt < maxAttempts) {
          const backoff = retryAfterSeconds ? retryAfterSeconds * 1000 : 500 * 2 ** attempt;
          logger.warn(
            {
              feature: 'projection.message_editor',
              channel_id: payload.channelId,
              message_id: payload.messageId,
              attempt,
              backoff_ms: backoff
            },
            'Rate limited while editing message, retrying',
          );
          await sleep(backoff);
          continue;
        }

        logger.error(
          {
            feature: 'projection.message_editor',
            channel_id: payload.channelId,
            message_id: payload.messageId,
            attempt,
            error
          },
          'Failed to edit message',
        );
        throw error;
      }
    }
  }
}

```

## src/discord/projections/scoreboardRenderer.ts
```ts
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
    (row, idx) => `${idx + 1}. <@${row.user1Id}> + <@${row.user2Id}> РІР‚вЂќ **${row.points}** pts`,
  );
  return ['Top 5', ...rows].join('\n');
}

function roundStatus(snapshot: DuelScoreboardSnapshot): string {
  if (!snapshot.roundNo) {
    return 'Round: _not started_';
  }

  const endsAt = snapshot.roundEndsAt
    ? ` РІР‚Сћ ends <t:${Math.floor(snapshot.roundEndsAt.getTime() / 1000)}:R>`
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
    action: 'participate',
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
              label: 'How to participate'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: myRoomId,
              label: 'Open my room'
            }
          ])
        ]
      })
    ]
  };
}

```

## src/discord/projections/raidProgressRenderer.ts
```ts
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
      (pair, idx) => `${idx + 1}. <@${pair.user1Id}> + <@${pair.user2Id}> РІР‚вЂќ **${pair.points}** pts`,
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
            `Week: \`${snapshot.weekStartDate}\` РІР‚Сћ ends <t:${Math.floor(snapshot.weekEndAt.getTime() / 1000)}:R>\nParticipants: **${snapshot.participantsCount}**`,
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

```

## src/discord/projections/scoreboard.ts
```ts
import { duelScoreboardSnapshotUsecase } from '../../app/usecases/duelUsecases';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderDuelScoreboard } from './scoreboardRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';

export { renderDuelScoreboard } from './scoreboardRenderer';

export async function refreshDuelScoreboardProjection(
  duelId: string,
  messageEditor: ThrottledMessageEditor,
): Promise<void> {
  const snapshot = await duelScoreboardSnapshotUsecase(duelId);
  if (!snapshot.scoreboardMessageId) {
    logger.warn({ feature: 'duel', duel_id: duelId }, 'Missing scoreboard message id');
    return;
  }

  const view = renderDuelScoreboard(snapshot);

  await messageEditor.queueEdit({
    channelId: snapshot.publicChannelId,
    messageId: snapshot.scoreboardMessageId,
    content: view.content ?? null,
    components: view.components,
    flags: COMPONENTS_V2_FLAGS
  });
}

```

## src/discord/projections/raidProgress.ts
```ts
import { and, eq } from 'drizzle-orm';
import { isFeatureEnabled } from '../../config/featureFlags';
import { getRaidProgressSnapshot } from '../../app/services/raidService';
import { db } from '../../infra/db/drizzle';
import { raids } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderRaidProgress } from './raidProgressRenderer';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';

async function refreshOneRaid(raidId: string, messageEditor: ThrottledMessageEditor): Promise<void> {
  const snapshot = await getRaidProgressSnapshot({ raidId });
  if (!snapshot || !snapshot.progressMessageId) {
    return;
  }

  const view = renderRaidProgress(snapshot);
  await messageEditor.queueEdit({
    channelId: snapshot.publicChannelId,
    messageId: snapshot.progressMessageId,
    content: view.content ?? null,
    components: view.components,
    flags: COMPONENTS_V2_FLAGS
  });
}

export async function refreshRaidProgressProjection(
  messageEditor: ThrottledMessageEditor,
  raidId?: string,
): Promise<void> {
  if (!isFeatureEnabled('raid')) {
    logger.debug({ feature: 'raid' }, 'Raid projection skipped because feature is disabled');
    return;
  }

  if (raidId) {
    await refreshOneRaid(raidId, messageEditor);
    return;
  }

  const activeRaids = await db
    .select({ id: raids.id })
    .from(raids)
    .where(and(eq(raids.status, 'active')));

  for (const row of activeRaids) {
    await refreshOneRaid(row.id, messageEditor);
  }
}

```

## src/discord/projections/oracleWeeklyRenderer.ts
```ts
import {
  actionRowButtons,
  ButtonStyle,
  ComponentType,
  separator,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';
import { encodeCustomId } from '../interactions/customId';

export function renderWeeklyOraclePost(params: {
  guildId: string;
  weekStartDate: string;
}): ComponentsV2Message {
  const claimId = encodeCustomId({
    feature: 'oracle',
    action: 'claim_open',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  const aboutId = encodeCustomId({
    feature: 'oracle',
    action: 'about',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  const ritualId = encodeCustomId({
    feature: 'oracle',
    action: 'start_pair_ritual',
    payload: {
      g: params.guildId,
      w: params.weekStartDate
    }
  });

  return {
    components: [
      uiCard({
        title: 'Weekly Oracle',
        status: `Week ${params.weekStartDate}`,
        accentColor: 0x74512d,
        components: [
          textBlock(
            'Your shared pattern for this week is ready.\nGet your private guidance in one tap.\nPair ritual prompts are designed for a calm 10-minute check-in.',
          ),
          separator(),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: claimId,
              label: 'Get privately'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: aboutId,
              label: 'About'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: ritualId,
              label: 'Start pair ritual'
            }
          ])
        ]
      })
    ]
  };
}

```

## src/app/services/publicPostService.ts
```ts
import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, or } from 'drizzle-orm';
import type { Client, MessageCreateOptions } from 'discord.js';
import { z } from 'zod';
import { renderWeeklyOraclePost } from '../../discord/projections/oracleWeeklyRenderer';
import { sendComponentsV2Message, type ComponentsV2Message } from '../../discord/ui-v2';
import { db } from '../../infra/db/drizzle';
import { anonQuestions, scheduledPosts } from '../../infra/db/schema';
import { logger } from '../../lib/logger';

const anonPayloadSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  guildId: z.string(),
  authorUserId: z.string().optional()
});

const checkinAgreementPayloadSchema = z.object({
  checkinId: z.string(),
  agreementText: z.string(),
  user1Id: z.string(),
  user2Id: z.string(),
  weekStartDate: z.string()
});

const checkinNudgePayloadSchema = z.object({
  weekStartDate: z.string()
});

const oracleWeeklyPayloadSchema = z.object({
  guildId: z.string(),
  weekStartDate: z.string()
});

export type ScheduledPostType =
  | 'anon_question'
  | 'checkin_agreement'
  | 'checkin_nudge'
  | 'oracle_weekly'
  | 'text';

export async function createScheduledPost(input: {
  guildId: string;
  type: ScheduledPostType;
  targetChannelId: string;
  payloadJson: unknown;
  scheduledFor?: Date;
  idempotencyKey: string;
}): Promise<{ id: string; created: boolean }> {
  const scheduledFor = input.scheduledFor ?? new Date();

  const inserted = await db
    .insert(scheduledPosts)
    .values({
      id: randomUUID(),
      guildId: input.guildId,
      type: input.type,
      targetChannelId: input.targetChannelId,
      payloadJson: input.payloadJson,
      scheduledFor,
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
      updatedAt: new Date()
    })
    .onConflictDoNothing({ target: scheduledPosts.idempotencyKey })
    .returning({ id: scheduledPosts.id });

  if (inserted[0]) {
    return { id: inserted[0].id, created: true };
  }

  const existing = await db
    .select({ id: scheduledPosts.id })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing[0]) {
    throw new Error('Scheduled post conflict detected but row not found');
  }

  return { id: existing[0].id, created: false };
}

function isSendableChannel(
  channel: unknown,
): channel is { send: (options: string | MessageCreateOptions) => Promise<{ id: string }> } {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'send' in channel && typeof channel.send === 'function';
}

type BuiltMessage =
  | { kind: 'legacy'; options: string | MessageCreateOptions }
  | { kind: 'v2'; message: ComponentsV2Message };

function buildMessageOptions(row: typeof scheduledPosts.$inferSelect): BuiltMessage {
  if (row.type === 'anon_question') {
    const payload = anonPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content: `## Anonymous Question\n${payload.questionText}`
      }
    };
  }

  if (row.type === 'checkin_agreement') {
    const payload = checkinAgreementPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content:
          `## Weekly Agreement\n` +
          `Pair: <@${payload.user1Id}> + <@${payload.user2Id}>\n` +
          `Week: \`${payload.weekStartDate}\`\n\n` +
          `> ${payload.agreementText}`
      }
    };
  }

  if (row.type === 'checkin_nudge') {
    const payload = checkinNudgePayloadSchema.parse(row.payloadJson);
    return {
      kind: 'legacy',
      options: {
        content:
          `## Weekly Check-in Reminder\n` +
          `Week: \`${payload.weekStartDate}\`\n` +
          'Use `/checkin start` in your pair room to submit this week.',
      }
    };
  }

  if (row.type === 'oracle_weekly') {
    const payload = oracleWeeklyPayloadSchema.parse(row.payloadJson);
    return {
      kind: 'v2',
      message: renderWeeklyOraclePost({
        guildId: payload.guildId,
        weekStartDate: payload.weekStartDate
      })
    };
  }

  const payload = z.object({ content: z.string() }).parse(row.payloadJson);
  return { kind: 'legacy', options: payload.content };
}

function truncateError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 800);
}

async function finalizeScheduledPost(
  row: typeof scheduledPosts.$inferSelect,
  publishedMessageId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(scheduledPosts)
      .set({
        status: 'sent',
        sentAt: new Date(),
        publishedMessageId,
        lastError: null,
        updatedAt: new Date()
      })
      .where(eq(scheduledPosts.id, row.id));

    if (row.type === 'anon_question') {
      const payload = anonPayloadSchema.parse(row.payloadJson);
      await tx
        .update(anonQuestions)
        .set({
          status: 'published',
          publishedMessageId,
          approvedAt: new Date()
        })
        .where(eq(anonQuestions.id, payload.questionId));
    }
  });
}

async function failScheduledPost(rowId: string, error: unknown): Promise<void> {
  await db
    .update(scheduledPosts)
    .set({
      status: 'failed',
      lastError: truncateError(error),
      updatedAt: new Date()
    })
    .where(eq(scheduledPosts.id, rowId));
}

async function claimScheduledPost(
  rowId: string,
  staleBefore: Date,
): Promise<typeof scheduledPosts.$inferSelect | null> {
  const claimed = await db
    .update(scheduledPosts)
    .set({
      status: 'processing',
      lastError: null,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(scheduledPosts.id, rowId),
        or(
          eq(scheduledPosts.status, 'pending'),
          and(eq(scheduledPosts.status, 'processing'), lte(scheduledPosts.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning();

  return claimed[0] ?? null;
}

export async function publishDueScheduledPosts(input: {
  client: Client;
  scheduledPostId?: string;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  if (!input.client.isReady()) {
    throw new Error('Discord client is not ready');
  }

  const limit = input.limit ?? 20;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);

  const rows = input.scheduledPostId
    ? await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, input.scheduledPostId)).limit(1)
    : await db
        .select()
        .from(scheduledPosts)
        .where(
          and(
            lte(scheduledPosts.scheduledFor, now),
            or(
              eq(scheduledPosts.status, 'pending'),
              and(eq(scheduledPosts.status, 'processing'), lte(scheduledPosts.updatedAt, staleBefore)),
            ),
          ),
        )
        .orderBy(asc(scheduledPosts.scheduledFor), asc(scheduledPosts.createdAt))
        .limit(limit);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const claimed = await claimScheduledPost(row.id, staleBefore);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    processed += 1;

    try {
      const messageOptions = buildMessageOptions(claimed);
      let sentMessage: { id: string };

      if (messageOptions.kind === 'v2') {
        sentMessage = await sendComponentsV2Message(input.client, claimed.targetChannelId, messageOptions.message);
      } else {
        const channel = await input.client.channels.fetch(claimed.targetChannelId);
        if (!isSendableChannel(channel)) {
          throw new Error(`Channel ${claimed.targetChannelId} is not sendable`);
        }

        sentMessage = await channel.send(messageOptions.options);
      }

      await finalizeScheduledPost(claimed, sentMessage.id);
      sent += 1;
    } catch (error) {
      failed += 1;
      await failScheduledPost(claimed.id, error);
      logger.error(
        {
          feature: 'public_post',
          action: 'publish_failed',
          scheduled_post_id: claimed.id,
          error
        },
        'Failed to publish scheduled post',
      );
    }
  }

  return { processed, sent, failed, skipped };
}

```

## src/infra/db/schema/core.ts
```ts
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core';

export const guildSettings = pgTable('guild_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Almaty'),
  oracleChannelId: varchar('oracle_channel_id', { length: 32 }),
  questionsChannelId: varchar('questions_channel_id', { length: 32 }),
  raidChannelId: varchar('raid_channel_id', { length: 32 }),
  duelPublicChannelId: varchar('duel_public_channel_id', { length: 32 }),
  moderatorRoleId: varchar('moderator_role_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable('users', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const pairs = pgTable(
  'pairs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    user1Id: varchar('user1_id', { length: 32 }).notNull(),
    user2Id: varchar('user2_id', { length: 32 }).notNull(),
    userLow: varchar('user_low', { length: 32 }).notNull(),
    userHigh: varchar('user_high', { length: 32 }).notNull(),
    privateChannelId: varchar('private_channel_id', { length: 32 }).notNull(),
    pairHomeMessageId: varchar('pair_home_message_id', { length: 32 }),
    pairHomePinnedAt: timestamp('pair_home_pinned_at', { withTimezone: true }),
    pairHomePinAttemptedAt: timestamp('pair_home_pin_attempted_at', { withTimezone: true }),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    guildUsersUnique: unique('pairs_guild_user_low_user_high_uq').on(
      table.guildId,
      table.userLow,
      table.userHigh,
    )
  }),
);

export const duels = pgTable('duels', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  publicChannelId: varchar('public_channel_id', { length: 32 }).notNull(),
  scoreboardMessageId: varchar('scoreboard_message_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const duelRounds = pgTable(
  'duel_rounds',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    duelId: varchar('duel_id', { length: 36 }).notNull(),
    roundNo: integer('round_no').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true })
  },
  (table) => ({
    duelRoundUnique: unique('duel_rounds_duel_round_no_uq').on(table.duelId, table.roundNo)
  }),
);

export const duelSubmissions = pgTable(
  'duel_submissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    roundId: varchar('round_id', { length: 36 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    roundPairUnique: unique('duel_submissions_round_pair_uq').on(table.roundId, table.pairId)
  }),
);

export const scheduledPosts = pgTable('scheduled_posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  targetChannelId: varchar('target_channel_id', { length: 32 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  publishedMessageId: varchar('published_message_id', { length: 32 }),
  lastError: text('last_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const opDedup = pgTable('op_dedup', {
  operationKey: varchar('operation_key', { length: 200 }).primaryKey(),
  payloadHash: varchar('payload_hash', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const commandRateLimits = pgTable(
  'command_rate_limits',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    actionKey: varchar('action_key', { length: 64 }).notNull(),
    dayDate: text('day_date').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({
      name: 'command_rate_limits_pk',
      columns: [table.guildId, table.userId, table.actionKey, table.dayDate]
    })
  }),
);

export const contentOracleArchetypes = pgTable('content_oracle_archetypes', {
  key: varchar('key', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 100 }).notNull(),
  variantsJson: jsonb('variants_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const oracleWeeks = pgTable(
  'oracle_weeks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    archetypeKey: varchar('archetype_key', { length: 64 }).notNull(),
    seed: integer('seed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueWeek: unique('oracle_weeks_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const oracleClaims = pgTable(
  'oracle_claims',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    deliveredTo: varchar('delivered_to', { length: 32 }).notNull(),
    mode: varchar('mode', { length: 16 }),
    context: varchar('context', { length: 24 }),
    claimText: varchar('claim_text', { length: 600 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueClaim: unique('oracle_claims_guild_week_user_uq').on(
      table.guildId,
      table.weekStartDate,
      table.userId,
    )
  }),
);

export const agreementsLibrary = pgTable('agreements_library', {
  key: varchar('key', { length: 64 }).primaryKey(),
  text: varchar('text', { length: 240 }).notNull(),
  tagsJson: jsonb('tags_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const checkins = pgTable(
  'checkins',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    scoresJson: jsonb('scores_json').notNull(),
    agreementKey: varchar('agreement_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('submitted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueCheckin: unique('checkins_pair_week_uq').on(table.pairId, table.weekStartDate)
  }),
);

export const anonQuestions = pgTable('anon_questions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  guildId: varchar('guild_id', { length: 32 }).notNull(),
  authorUserId: varchar('author_user_id', { length: 32 }).notNull(),
  questionText: varchar('question_text', { length: 400 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  publishedMessageId: varchar('published_message_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: varchar('approved_by', { length: 32 }),
  approvedAt: timestamp('approved_at', { withTimezone: true })
});

export const rewardsLedger = pgTable(
  'rewards_ledger',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    kind: varchar('kind', { length: 24 }).notNull(),
    amount: integer('amount').notNull(),
    key: varchar('key', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueAward: unique('rewards_ledger_dedupe_uq').on(
      table.kind,
      table.key,
      table.sourceType,
      table.sourceId,
      table.userId,
    )
  }),
);

export const progressState = pgTable(
  'progress_state',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    pairId: varchar('pair_id', { length: 36 }),
    level: integer('level').notNull().default(1),
    unlocksJson: jsonb('unlocks_json').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueProgress: unique('progress_state_guild_user_uq').on(table.guildId, table.userId)
  }),
);

export const seasons = pgTable(
  'seasons',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    seasonKey: varchar('season_key', { length: 64 }).notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: varchar('status', { length: 24 }).notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueSeason: unique('seasons_guild_season_uq').on(table.guildId, table.seasonKey)
  }),
);

export const weeklyCapsules = pgTable(
  'weekly_capsules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    weekStartDate: text('week_start_date').notNull(),
    seed: integer('seed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueCapsuleWeek: unique('weekly_capsules_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const raids = pgTable(
  'raids',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    weekStartDate: text('week_start_date').notNull(),
    weekEndAt: timestamp('week_end_at', { withTimezone: true }).notNull(),
    goalPoints: integer('goal_points').notNull(),
    progressPoints: integer('progress_points').notNull().default(0),
    publicChannelId: varchar('public_channel_id', { length: 32 }).notNull(),
    progressMessageId: varchar('progress_message_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueRaidWeek: unique('raids_guild_week_uq').on(table.guildId, table.weekStartDate)
  }),
);

export const raidQuests = pgTable('raid_quests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  category: varchar('category', { length: 64 }).notNull(),
  difficulty: varchar('difficulty', { length: 16 }).notNull(),
  points: integer('points').notNull(),
  text: varchar('text', { length: 240 }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const raidDailyOffers = pgTable(
  'raid_daily_offers',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    questKeysJson: jsonb('quest_keys_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    uniqueOfferDay: unique('raid_daily_offers_raid_day_uq').on(table.raidId, table.dayDate)
  }),
);

export const raidClaims = pgTable(
  'raid_claims',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    questKey: varchar('quest_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending_confirm'),
    basePoints: integer('base_points').notNull(),
    bonusPoints: integer('bonus_points').notNull().default(0),
    requestedByUserId: varchar('requested_by_user_id', { length: 32 }),
    confirmedByUserId: varchar('confirmed_by_user_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true })
  },
  (table) => ({
    uniqueClaim: unique('raid_claims_raid_day_pair_quest_uq').on(
      table.raidId,
      table.dayDate,
      table.pairId,
      table.questKey,
    )
  }),
);

export const raidPairDailyTotals = pgTable(
  'raid_pair_daily_totals',
  {
    raidId: varchar('raid_id', { length: 36 }).notNull(),
    dayDate: text('day_date').notNull(),
    pairId: varchar('pair_id', { length: 36 }).notNull(),
    pointsTotal: integer('points_total').notNull().default(0)
  },
  (table) => ({
    uniqueTotal: unique('raid_pair_daily_totals_raid_day_pair_uq').on(
      table.raidId,
      table.dayDate,
      table.pairId,
    )
  }),
);

export const eventOutbox = pgTable('event_outbox', {
  id: varchar('id', { length: 36 }).primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true })
});

export const sequenceNumbers = pgTable('sequence_numbers', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: bigint('value', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

```

## src/infra/db/migrations/0002_step1_ui_v2.sql
```sql
ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_message_id" varchar(32);

ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_pinned_at" timestamptz;

ALTER TABLE "pairs"
  ADD COLUMN IF NOT EXISTS "pair_home_pin_attempted_at" timestamptz;

```

## src/infra/db/migrations/meta/_journal.json
```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": 1739683200000,
      "tag": "0000_init",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "7",
      "when": 1771200000000,
      "tag": "0001_phase2_runtime",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "7",
      "when": 1771286400000,
      "tag": "0002_step1_ui_v2",
      "breakpoints": true
    }
  ]
}

```

## src/app/services/pairHomeService.ts
```ts
import { and, desc, eq } from 'drizzle-orm';
import { RAID_DAILY_PAIR_CAP_POINTS } from '../../config/constants';
import { dateOnly, startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  checkins,
  duelRounds,
  duelSubmissions,
  duels,
  pairs,
  raidPairDailyTotals,
  raids,
} from '../../infra/db/schema';

export type PairHomeSnapshot = {
  pairId: string;
  guildId: string;
  privateChannelId: string;
  user1Id: string;
  user2Id: string;
  pairHomeMessageId: string | null;
  pairHomePinnedAt: Date | null;
  pairHomePinAttemptedAt: Date | null;
  weekStartDate: string;
  checkinSubmitted: boolean;
  raid: {
    active: boolean;
    raidId: string | null;
    pointsToday: number;
    dailyCap: number;
  };
  duel: {
    active: boolean;
    duelId: string | null;
    publicChannelId: string | null;
    roundId: string | null;
    roundNo: number | null;
    roundEndsAt: Date | null;
    submittedThisRound: boolean;
  };
  updatedAt: Date;
};

export async function getPairHomeSnapshot(pairId: string, now: Date = new Date()): Promise<PairHomeSnapshot | null> {
  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.id, pairId), eq(pairs.status, 'active')))
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    return null;
  }

  const weekStartDate = startOfWeekIso(now);
  const dayDate = dateOnly(now);

  const checkinRows = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(and(eq(checkins.pairId, pair.id), eq(checkins.weekStartDate, weekStartDate)))
    .limit(1);

  const raidRows = await db
    .select()
    .from(raids)
    .where(and(eq(raids.guildId, pair.guildId), eq(raids.status, 'active')))
    .orderBy(desc(raids.createdAt))
    .limit(1);
  const raid = raidRows[0] ?? null;

  let raidPointsToday = 0;
  if (raid) {
    const raidTodayRows = await db
      .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
      .from(raidPairDailyTotals)
      .where(
        and(
          eq(raidPairDailyTotals.raidId, raid.id),
          eq(raidPairDailyTotals.pairId, pair.id),
          eq(raidPairDailyTotals.dayDate, dayDate),
        ),
      )
      .limit(1);

    raidPointsToday = raidTodayRows[0]?.pointsTotal ?? 0;
  }

  const duelRows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.guildId, pair.guildId), eq(duels.status, 'active')))
    .orderBy(desc(duels.createdAt))
    .limit(1);
  const duel = duelRows[0] ?? null;

  let roundId: string | null = null;
  let roundNo: number | null = null;
  let roundEndsAt: Date | null = null;
  let submittedThisRound = false;

  if (duel) {
    const roundRows = await db
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.duelId, duel.id), eq(duelRounds.status, 'active')))
      .orderBy(desc(duelRounds.roundNo))
      .limit(1);

    const round = roundRows[0] ?? null;
    if (round) {
      roundId = round.id;
      roundNo = round.roundNo;
      roundEndsAt = round.endsAt;

      const submissionRows = await db
        .select({ id: duelSubmissions.id })
        .from(duelSubmissions)
        .where(and(eq(duelSubmissions.roundId, round.id), eq(duelSubmissions.pairId, pair.id)))
        .limit(1);

      submittedThisRound = Boolean(submissionRows[0]);
    }
  }

  return {
    pairId: pair.id,
    guildId: pair.guildId,
    privateChannelId: pair.privateChannelId,
    user1Id: pair.user1Id,
    user2Id: pair.user2Id,
    pairHomeMessageId: pair.pairHomeMessageId ?? null,
    pairHomePinnedAt: pair.pairHomePinnedAt ?? null,
    pairHomePinAttemptedAt: pair.pairHomePinAttemptedAt ?? null,
    weekStartDate,
    checkinSubmitted: Boolean(checkinRows[0]),
    raid: {
      active: Boolean(raid),
      raidId: raid?.id ?? null,
      pointsToday: raidPointsToday,
      dailyCap: RAID_DAILY_PAIR_CAP_POINTS
    },
    duel: {
      active: Boolean(duel),
      duelId: duel?.id ?? null,
      publicChannelId: duel?.publicChannelId ?? null,
      roundId,
      roundNo,
      roundEndsAt,
      submittedThisRound,
    },
    updatedAt: now
  };
}

```

## src/app/projections/pairHomeProjection.ts
```ts
import type PgBoss from 'pg-boss';
import { createCorrelationId } from '../../lib/correlation';
import { JobNames } from '../../infra/queue/jobs';

export async function requestPairHomeRefresh(
  boss: PgBoss,
  params: {
    guildId: string;
    pairId: string;
    reason: string;
    interactionId?: string;
    userId?: string;
    correlationId?: string;
  },
): Promise<string | null> {
  const correlationId = params.correlationId ?? createCorrelationId();

  return boss.send(
    JobNames.PairHomeRefresh,
    {
      correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'pair_home',
      action: 'refresh',
      pairId: params.pairId,
      reason: params.reason
    },
    {
      singletonKey: `pair-home:${params.guildId}:${params.pairId}`,
      singletonSeconds: 6,
      retryLimit: 2
    },
  );
}

```

## src/infra/queue/jobs.ts
```ts
import { z } from 'zod';

export const JobNames = {
  DuelRoundClose: 'duel.round.close',
  DuelScoreboardRefresh: 'duel.scoreboard.refresh',
  RaidProgressRefresh: 'raid.progress.refresh',
  PairHomeRefresh: 'pair.home.refresh',
  PublicPostPublish: 'public.post.publish',
  WeeklyOraclePublish: 'weekly.oracle.publish',
  WeeklyCheckinNudge: 'weekly.checkin.nudge',
  WeeklyRaidStart: 'weekly.raid.start',
  WeeklyRaidEnd: 'weekly.raid.end',
  DailyRaidOffersGenerate: 'daily.raid.offers.generate'
} as const;

export type JobName = (typeof JobNames)[keyof typeof JobNames];

export const AllJobNames = Object.values(JobNames) as readonly JobName[];

export const baseJobSchema = z.object({
  correlationId: z.string().uuid(),
  interactionId: z.string().optional(),
  guildId: z.string(),
  userId: z.string().optional(),
  feature: z.string(),
  action: z.string()
});

export const duelRoundClosePayloadSchema = baseJobSchema.extend({
  duelId: z.string(),
  roundId: z.string(),
  roundNo: z.number().int().positive()
});

export const duelScoreboardRefreshPayloadSchema = baseJobSchema.extend({
  duelId: z.string(),
  reason: z.string().default('unknown')
});

export const raidProgressRefreshPayloadSchema = baseJobSchema.extend({
  raidId: z.string().optional()
});

export const pairHomeRefreshPayloadSchema = baseJobSchema.extend({
  pairId: z.string(),
  reason: z.string().default('unknown')
});

export const publicPostPublishPayloadSchema = baseJobSchema.extend({
  scheduledPostId: z.string().optional()
});

export const genericScheduledPayloadSchema = baseJobSchema.extend({
  weekStartDate: z.string().optional()
});

export type DuelRoundClosePayload = z.infer<typeof duelRoundClosePayloadSchema>;
export type DuelScoreboardRefreshPayload = z.infer<typeof duelScoreboardRefreshPayloadSchema>;
export type RaidProgressRefreshPayload = z.infer<typeof raidProgressRefreshPayloadSchema>;
export type PairHomeRefreshPayload = z.infer<typeof pairHomeRefreshPayloadSchema>;
export type PublicPostPublishPayload = z.infer<typeof publicPostPublishPayloadSchema>;
export type GenericScheduledPayload = z.infer<typeof genericScheduledPayloadSchema>;

```

## src/discord/projections/pairHomeRenderer.ts
```ts
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
    ? ` вЂў ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
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
          ])
        ]
      })
    ]
  };
}

```

## src/discord/projections/pairHome.ts
```ts
import { and, eq, isNull } from 'drizzle-orm';
import { Routes } from '../ui-v2/api';
import type { Client } from 'discord.js';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { db } from '../../infra/db/drizzle';
import { pairs } from '../../infra/db/schema';
import { logger } from '../../lib/logger';
import { COMPONENTS_V2_FLAGS, sendComponentsV2Message } from '../ui-v2';
import type { ThrottledMessageEditor } from './messageEditor';
import { renderPairHomePanel } from './pairHomeRenderer';

async function attemptSinglePin(params: {
  client: Client;
  pairId: string;
  channelId: string;
  messageId: string;
  pinAttemptedAt: Date | null;
}): Promise<void> {
  if (params.pinAttemptedAt) {
    return;
  }

  let pinnedAt: Date | null = null;
  try {
    const channel = await params.client.channels.fetch(params.channelId);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(params.messageId);
      await message.pin();
      pinnedAt = new Date();
    }
  } catch {
    // Optional pinning is best-effort and should fail silently.
  }

  await db
    .update(pairs)
    .set({
      pairHomePinAttemptedAt: new Date(),
      pairHomePinnedAt: pinnedAt
    })
    .where(eq(pairs.id, params.pairId));
}

export async function refreshPairHomeProjection(input: {
  pairId: string;
  client: Client;
  messageEditor: ThrottledMessageEditor;
}): Promise<void> {
  const snapshot = await getPairHomeSnapshot(input.pairId);
  if (!snapshot) {
    return;
  }

  const view = renderPairHomePanel(snapshot);

  if (snapshot.pairHomeMessageId) {
    await input.messageEditor.queueEdit({
      channelId: snapshot.privateChannelId,
      messageId: snapshot.pairHomeMessageId,
      content: view.content ?? null,
      components: view.components,
      flags: COMPONENTS_V2_FLAGS
    });
    return;
  }

  const created = await sendComponentsV2Message(input.client, snapshot.privateChannelId, view);

  const updated = await db
    .update(pairs)
    .set({
      pairHomeMessageId: created.id
    })
    .where(and(eq(pairs.id, snapshot.pairId), isNull(pairs.pairHomeMessageId), eq(pairs.status, 'active')))
    .returning({ id: pairs.id });

  if (!updated[0]) {
    const latestRows = await db
      .select({ pairHomeMessageId: pairs.pairHomeMessageId })
      .from(pairs)
      .where(eq(pairs.id, snapshot.pairId))
      .limit(1);
    const latestMessageId = latestRows[0]?.pairHomeMessageId ?? null;

    if (latestMessageId && latestMessageId !== created.id) {
      await input.messageEditor.queueEdit({
        channelId: snapshot.privateChannelId,
        messageId: latestMessageId,
        content: view.content ?? null,
        components: view.components,
        flags: COMPONENTS_V2_FLAGS
      });

      try {
        await input.client.rest.delete(Routes.channelMessage(snapshot.privateChannelId, created.id));
      } catch {
        logger.warn(
          {
            feature: 'pair_home',
            pair_id: snapshot.pairId,
            message_id: created.id
          },
          'Failed to delete duplicate pair home message',
        );
      }
    }

    return;
  }

  await attemptSinglePin({
    client: input.client,
    pairId: snapshot.pairId,
    channelId: snapshot.privateChannelId,
    messageId: created.id,
    pinAttemptedAt: snapshot.pairHomePinAttemptedAt
  });
}

```

## src/infra/queue/boss.ts
```ts
import { randomUUID } from 'node:crypto';
import type { Client } from 'discord.js';
import PgBoss from 'pg-boss';
import {
  AllJobNames,
  duelRoundClosePayloadSchema,
  duelScoreboardRefreshPayloadSchema,
  genericScheduledPayloadSchema,
  type JobName,
  JobNames,
  pairHomeRefreshPayloadSchema,
  publicPostPublishPayloadSchema,
  raidProgressRefreshPayloadSchema
} from './jobs';
import { JOB_RETRY_DELAY_SECONDS, JOB_RETRY_LIMIT } from '../../config/constants';
import { logger } from '../../lib/logger';
import { captureException } from '../sentry/sentry';
import { duelCloseRoundUsecase } from '../../app/usecases/duelUsecases';
import { refreshDuelScoreboardProjection } from '../../discord/projections/scoreboard';
import type { ThrottledMessageEditor } from '../../discord/projections/messageEditor';
import { refreshRaidProgressProjection } from '../../discord/projections/raidProgress';
import { refreshPairHomeProjection } from '../../discord/projections/pairHome';
import { sendComponentsV2Message, textBlock, uiCard } from '../../discord/ui-v2';
import { configureRecurringSchedules } from './scheduler';
import { publishDueScheduledPosts } from '../../app/services/publicPostService';
import { scheduleWeeklyOraclePosts } from '../../app/services/oracleService';
import { scheduleWeeklyCheckinNudges } from '../../app/services/checkinService';
import {
  endExpiredRaids,
  generateDailyRaidOffers,
  startWeeklyRaidsForConfiguredGuilds
} from '../../app/services/raidService';

type QueueRuntimeParams = {
  databaseUrl: string;
};

export type QueueRuntime = {
  boss: PgBoss;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: () => boolean;
  setMessageEditor: (editor: ThrottledMessageEditor) => void;
  setDiscordClient: (client: Client) => void;
};

type PgErrorLike = {
  code?: string;
  message?: string;
};

function isQueueExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const parsed = error as PgErrorLike;

  if (parsed.code === '23505') {
    return true;
  }

  const message = parsed.message?.toLowerCase() ?? '';
  return message.includes('queue') && message.includes('already exists');
}

export async function ensureQueues(boss: PgBoss, jobNames: readonly JobName[]): Promise<void> {
  logger.info(
    { feature: 'queue', action: 'ensureQueues', queue_count: jobNames.length },
    'Ensuring pg-boss queues',
  );

  for (const name of jobNames) {
    try {
      await boss.createQueue(name);
    } catch (error) {
      if (isQueueExistsError(error)) {
        continue;
      }

      throw error;
    }
  }

  logger.info({ feature: 'queue', action: 'ensureQueues' }, 'pg-boss queues ensured');
}

export function createQueueRuntime(params: QueueRuntimeParams): QueueRuntime {
  const boss = new PgBoss({
    connectionString: params.databaseUrl,
    schema: 'public',
    migrate: true,
    retryLimit: JOB_RETRY_LIMIT,
    retryDelay: JOB_RETRY_DELAY_SECONDS,
    monitorStateIntervalSeconds: 15,
    maintenanceIntervalSeconds: 60
  });

  let ready = false;
  let messageEditor: ThrottledMessageEditor | null = null;
  let discordClient: Client | null = null;

  async function registerHandlers(): Promise<void> {
    await boss.work(JobNames.DuelRoundClose, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelRoundClosePayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        await duelCloseRoundUsecase({
          guildId: parsed.guildId,
          duelId: parsed.duelId,
          roundId: parsed.roundId,
          correlationId: parsed.correlationId,
          interactionId: parsed.interactionId,
          userId: parsed.userId,
          boss,
        });

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.DuelScoreboardRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = duelScoreboardRefreshPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            correlation_id: parsed.correlationId,
            guild_id: parsed.guildId,
            interaction_id: parsed.interactionId,
            user_id: parsed.userId,
            job_id: job.id
          },
          'job started',
        );

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshDuelScoreboardProjection(parsed.duelId, messageEditor);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.RaidProgressRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = raidProgressRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        await refreshRaidProgressProjection(messageEditor, parsed.raidId);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PairHomeRefresh, async (jobs) => {
      for (const job of jobs) {
        const parsed = pairHomeRefreshPayloadSchema.parse(job.data);
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');

        if (!messageEditor) {
          throw new Error('Message editor not initialized');
        }

        if (!discordClient) {
          throw new Error('Discord client not initialized');
        }

        await refreshPairHomeProjection({
          pairId: parsed.pairId,
          messageEditor,
          client: discordClient
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job completed');
      }
    });

    await boss.work(JobNames.PublicPostPublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = publicPostPublishPayloadSchema.parse(job.data);
        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            scheduled_post_id: parsed.scheduledPostId ?? null
          },
          'job started',
        );

        if (!discordClient) {
          throw new Error('Discord client not initialized for public post publish');
        }

        const result = await publishDueScheduledPosts({
          client: discordClient,
          scheduledPostId: parsed.scheduledPostId,
          limit: 20
        });

        logger.info(
          {
            feature: parsed.feature,
            action: parsed.action,
            guild_id: parsed.guildId,
            job_id: job.id,
            processed: result.processed,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped
          },
          'job completed',
        );
      }
    });

    await boss.work(JobNames.WeeklyOraclePublish, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyOraclePublish,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await scheduleWeeklyOraclePosts();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyCheckinNudge, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyCheckinNudge,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await scheduleWeeklyCheckinNudges();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidStart, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidStart,
            action: 'tick'
          },
        );

        const readyClient = discordClient;
        if (!readyClient) {
          throw new Error('Discord client not initialized for weekly raid start');
        }

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const created = await startWeeklyRaidsForConfiguredGuilds({
          boss,
          correlationId: parsed.correlationId,
          createProgressMessage: async ({ channelId, content }) => {
            const sent = await sendComponentsV2Message(readyClient, channelId, {
              components: [
                uiCard({
                  title: 'Cooperative Raid Progress',
                  status: 'initializing',
                  accentColor: 0x1e6f9f,
                  components: [textBlock(content)]
                })
              ]
            });
            return sent.id;
          }
        });
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, created }, 'job completed');
      }
    });

    await boss.work(JobNames.WeeklyRaidEnd, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.WeeklyRaidEnd,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const ended = await endExpiredRaids();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, ended }, 'job completed');
      }
    });

    await boss.work(JobNames.DailyRaidOffersGenerate, async (jobs) => {
      for (const job of jobs) {
        const parsed = genericScheduledPayloadSchema.parse(
          job.data ?? {
            correlationId: randomUUID(),
            guildId: 'scheduler',
            feature: JobNames.DailyRaidOffersGenerate,
            action: 'tick'
          },
        );

        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id }, 'job started');
        const generated = await generateDailyRaidOffers();
        logger.info({ feature: parsed.feature, action: parsed.action, job_id: job.id, generated }, 'job completed');
      }
    });
  }

  boss.on('error', (error) => {
    logger.error({ error, feature: 'queue' }, 'pg-boss error');
    captureException(error, { feature: 'queue' });
  });

  return {
    boss,
    setMessageEditor(editor) {
      messageEditor = editor;
    },
    setDiscordClient(client) {
      discordClient = client;
    },
    async start() {
      try {
        await boss.start();
        await ensureQueues(boss, AllJobNames);
        await registerHandlers();
        await configureRecurringSchedules(boss);
        ready = true;
        logger.info({ feature: 'queue' }, 'pg-boss started');
      } catch (error) {
        ready = false;
        captureException(error, { feature: 'queue.start' });
        throw error;
      }
    },
    async stop() {
      ready = false;
      await boss.stop();
      logger.info({ feature: 'queue' }, 'pg-boss stopped');
    },
    isReady() {
      return ready;
    }
  };
}

```

## src/app/services/duelService.ts
```ts
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type PgBoss from 'pg-boss';
import { DUEL_MAX_ROUND_MINUTES, DUEL_MIN_ROUND_MINUTES } from '../../config/constants';
import { DomainError } from '../../domain/errors';
import { computeSubmissionScore, type DuelSubmissionPayload } from '../../domain/duels/scoring';
import { db } from '../../infra/db/drizzle';
import { listActivePairs } from '../../infra/db/queries/duels';
import { duelRounds, duelSubmissions, duels, pairs } from '../../infra/db/schema';
import { JobNames } from '../../infra/queue/jobs';
import { addMinutes } from '../../lib/time';
import { requestScoreboardRefresh } from '../projections/scoreboardProjection';
import { requestPairHomeRefresh } from '../projections/pairHomeProjection';
import { awardPairReward } from './rewardsService';

export type DuelScoreboardPairRow = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  points: number;
  submissions: number;
};

export type DuelScoreboardSnapshot = {
  duelId: string;
  guildId: string;
  status: string;
  publicChannelId: string;
  scoreboardMessageId: string | null;
  roundNo: number | null;
  roundStatus: string;
  roundEndsAt: Date | null;
  topPairs: DuelScoreboardPairRow[];
  totalPairs: number;
  totalSubmissions: number;
  updatedAt: Date;
};

export async function getActiveDuelForGuild(guildId: string) {
  const rows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.guildId, guildId), eq(duels.status, 'active')))
    .orderBy(desc(duels.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function startDuel(params: {
  guildId: string;
  publicChannelId: string;
  createScoreboardMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  const existing = await getActiveDuelForGuild(params.guildId);
  if (existing) {
    return { duel: existing, created: false };
  }

  const duelId = randomUUID();
  const [created] = await db
    .insert(duels)
    .values({
      id: duelId,
      guildId: params.guildId,
      status: 'active',
      publicChannelId: params.publicChannelId
    })
    .returning();

  if (!created) {
    throw new DomainError('Failed to create duel', 'DUEL_CREATE_FAILED');
  }

  const messageId = await params.createScoreboardMessage('Initializing duel scoreboard...');

  await db
    .update(duels)
    .set({ scoreboardMessageId: messageId, updatedAt: new Date() })
    .where(eq(duels.id, duelId));

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'duel_start'
  });

  const duel = await getActiveDuelForGuild(params.guildId);
  if (!duel) {
    throw new DomainError('Duel created but missing', 'DUEL_MISSING');
  }

  return { duel, created: true };
}

export async function endDuel(params: {
  guildId: string;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  const active = await getActiveDuelForGuild(params.guildId);
  if (!active) {
    throw new DomainError('No active duel found', 'DUEL_NOT_FOUND');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(duels)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(duels.id, active.id));

    await tx
      .update(duelRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(and(eq(duelRounds.duelId, active.id), eq(duelRounds.status, 'active')));
  });

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId: active.id,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'duel_end'
  });

  return active;
}

export async function startRound(params: {
  guildId: string;
  durationMinutes: number;
  notifyPair: (params: {
    pairId: string;
    privateChannelId: string;
    duelId: string;
    roundId: string;
    roundNo: number;
    endsAt: Date;
  }) => Promise<void>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  if (params.durationMinutes < DUEL_MIN_ROUND_MINUTES || params.durationMinutes > DUEL_MAX_ROUND_MINUTES) {
    throw new DomainError(
      `Round duration must be between ${DUEL_MIN_ROUND_MINUTES} and ${DUEL_MAX_ROUND_MINUTES} minutes`,
      'ROUND_DURATION_INVALID',
    );
  }

  const now = new Date();
  const endsAt = addMinutes(now, params.durationMinutes);

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${params.guildId}), hashtext('duel.round.start')) as locked`,
    );

    const locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) {
      throw new DomainError('Round start is already in progress', 'ROUND_START_LOCKED');
    }

    const duelRows = await tx
      .select()
      .from(duels)
      .where(and(eq(duels.guildId, params.guildId), eq(duels.status, 'active')))
      .orderBy(desc(duels.createdAt))
      .limit(1);

    const activeDuel = duelRows[0];
    if (!activeDuel) {
      throw new DomainError('No active duel found', 'DUEL_NOT_FOUND');
    }

    const existingRoundRows = await tx
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.duelId, activeDuel.id), eq(duelRounds.status, 'active')))
      .limit(1);

    if (existingRoundRows[0]) {
      throw new DomainError('An active round already exists', 'ROUND_ALREADY_ACTIVE');
    }

    const countRows = await tx
      .select({ maxRound: sql<number>`coalesce(max(${duelRounds.roundNo}), 0)` })
      .from(duelRounds)
      .where(eq(duelRounds.duelId, activeDuel.id));

    const roundNo = Number(countRows[0]?.maxRound ?? 0) + 1;
    const roundId = randomUUID();

    const [round] = await tx
      .insert(duelRounds)
      .values({
        id: roundId,
        duelId: activeDuel.id,
        roundNo,
        status: 'active',
        startedAt: now,
        endsAt
      })
      .returning();

    if (!round) {
      throw new DomainError('Failed to create round', 'ROUND_CREATE_FAILED');
    }

    return {
      duel: activeDuel,
      round
    };
  });

  const activePairs = await listActivePairs(params.guildId);

  for (const pair of activePairs) {
    await params.notifyPair({
      pairId: pair.id,
      privateChannelId: pair.privateChannelId,
      duelId: txResult.duel.id,
      roundId: txResult.round.id,
      roundNo: txResult.round.roundNo,
      endsAt
    });

    await requestPairHomeRefresh(params.boss, {
      guildId: params.guildId,
      pairId: pair.id,
      reason: 'duel_round_started',
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId
    });
  }

  await params.boss.send(
    JobNames.DuelRoundClose,
    {
      correlationId: params.correlationId,
      interactionId: params.interactionId,
      guildId: params.guildId,
      userId: params.userId,
      feature: 'duel',
      action: 'round.close',
      duelId: txResult.duel.id,
      roundId: txResult.round.id,
      roundNo: txResult.round.roundNo
    },
    {
      startAfter: endsAt,
      singletonKey: `duel-round-close:${params.guildId}:${txResult.duel.id}:${txResult.round.roundNo}`,
      singletonSeconds: 60,
      retryLimit: 5
    },
  );

  await requestScoreboardRefresh(params.boss, {
    guildId: params.guildId,
    duelId: txResult.duel.id,
    interactionId: params.interactionId,
    userId: params.userId,
    correlationId: params.correlationId,
    reason: 'round_start'
  });

  return {
    duel: txResult.duel,
    round: txResult.round,
    pairCount: activePairs.length
  };
}

export async function closeRound(params: {
  guildId: string;
  duelId: string;
  roundId: string;
  correlationId: string;
  boss: PgBoss;
  interactionId?: string;
  userId?: string;
}) {
  const result = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${params.guildId}), hashtext('duel.round.close')) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      return { changed: false } as const;
    }

    const roundRows = await tx
      .select()
      .from(duelRounds)
      .where(and(eq(duelRounds.id, params.roundId), eq(duelRounds.duelId, params.duelId)))
      .limit(1);

    const round = roundRows[0];
    if (!round || round.status === 'closed') {
      return { changed: false } as const;
    }

    await tx
      .update(duelRounds)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(duelRounds.id, params.roundId));

    return { changed: true } as const;
  });

  if (result.changed) {
    await requestScoreboardRefresh(params.boss, {
      guildId: params.guildId,
      duelId: params.duelId,
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId,
      reason: 'round_close'
    });
  }

  return result;
}

export async function submitRoundAnswer(params: {
  guildId: string;
  duelId: string;
  roundId: string;
  pairId: string;
  userId: string;
  answer: string;
  correlationId: string;
  interactionId?: string;
  boss: PgBoss;
}) {
  const normalizedAnswer = params.answer.trim();
  if (normalizedAnswer.length < 2 || normalizedAnswer.length > 400) {
    throw new DomainError('Answer must be between 2 and 400 characters', 'DUEL_SUBMISSION_INVALID');
  }

  const roundRows = await db
    .select({
      id: duelRounds.id,
      duelId: duelRounds.duelId,
      status: duelRounds.status,
      endsAt: duelRounds.endsAt
    })
    .from(duelRounds)
    .where(and(eq(duelRounds.id, params.roundId), eq(duelRounds.duelId, params.duelId)))
    .limit(1);

  const round = roundRows[0];
  if (!round || round.status !== 'active') {
    throw new DomainError('Round is not active', 'ROUND_NOT_ACTIVE');
  }

  if (round.endsAt.getTime() < Date.now()) {
    throw new DomainError('Round has ended', 'ROUND_ENDED');
  }

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.id, params.pairId), eq(pairs.guildId, params.guildId), eq(pairs.status, 'active')))
    .limit(1);

  const pair = pairRows[0];
  if (!pair) {
    throw new DomainError('Pair not found', 'PAIR_NOT_FOUND');
  }

  if (pair.user1Id !== params.userId && pair.user2Id !== params.userId) {
    throw new DomainError('User is not a member of this pair', 'PAIR_ACCESS_DENIED');
  }

  const payload: DuelSubmissionPayload = {
    answer: normalizedAnswer
  };

  const inserted = await db
    .insert(duelSubmissions)
    .values({
      id: randomUUID(),
      roundId: params.roundId,
      pairId: params.pairId,
      payloadJson: payload
    })
    .onConflictDoNothing({
      target: [duelSubmissions.roundId, duelSubmissions.pairId]
    })
    .returning({ id: duelSubmissions.id });

  if (inserted.length > 0) {
    await awardPairReward({
      guildId: params.guildId,
      pairId: pair.id,
      userIds: [pair.user1Id, pair.user2Id],
      kind: 'duel',
      amount: 1,
      key: `duel:${params.roundId}:${params.pairId}`,
      sourceType: 'duel_submission',
      sourceId: params.roundId
    });

    await requestScoreboardRefresh(params.boss, {
      guildId: params.guildId,
      duelId: params.duelId,
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId,
      reason: 'submission'
    });

    await requestPairHomeRefresh(params.boss, {
      guildId: params.guildId,
      pairId: params.pairId,
      interactionId: params.interactionId,
      userId: params.userId,
      correlationId: params.correlationId,
      reason: 'duel_submission_accepted'
    });
  }

  return {
    accepted: inserted.length > 0
  };
}

export async function getScoreboardSnapshot(duelId: string): Promise<DuelScoreboardSnapshot> {
  const duelRows = await db.select().from(duels).where(eq(duels.id, duelId)).limit(1);
  const duel = duelRows[0];

  if (!duel) {
    throw new DomainError('Duel not found', 'DUEL_NOT_FOUND');
  }

  const rounds = await db
    .select()
    .from(duelRounds)
    .where(eq(duelRounds.duelId, duel.id))
    .orderBy(asc(duelRounds.roundNo));

  const activeRound = [...rounds].reverse().find((round) => round.status === 'active') ?? null;

  const submissions = await db
    .select({
      pairId: duelSubmissions.pairId,
      payloadJson: duelSubmissions.payloadJson,
      roundId: duelSubmissions.roundId
    })
    .from(duelSubmissions)
    .innerJoin(duelRounds, eq(duelRounds.id, duelSubmissions.roundId))
    .where(eq(duelRounds.duelId, duel.id));

  const duelPairs = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, duel.guildId), eq(pairs.status, 'active')))
    .orderBy(asc(pairs.createdAt));

  const pairMap = new Map(duelPairs.map((pair) => [pair.id, pair]));
  const scoreMap = new Map<string, DuelScoreboardPairRow>();

  for (const submission of submissions) {
    const pair = pairMap.get(submission.pairId);
    if (!pair) {
      continue;
    }

    const payload = submission.payloadJson as DuelSubmissionPayload;
    const points = computeSubmissionScore(payload);

    const current = scoreMap.get(pair.id) ?? {
      pairId: pair.id,
      user1Id: pair.user1Id,
      user2Id: pair.user2Id,
      points: 0,
      submissions: 0
    };

    current.points += points;
    current.submissions += 1;
    scoreMap.set(pair.id, current);
  }

  for (const pair of duelPairs) {
    if (!scoreMap.has(pair.id)) {
      scoreMap.set(pair.id, {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        points: 0,
        submissions: 0
      });
    }
  }

  const topPairs = [...scoreMap.values()].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return a.pairId.localeCompare(b.pairId);
  });

  const latestRoundNo = rounds[rounds.length - 1]?.roundNo ?? null;

  return {
    duelId: duel.id,
    guildId: duel.guildId,
    status: duel.status,
    publicChannelId: duel.publicChannelId,
    scoreboardMessageId: duel.scoreboardMessageId ?? null,
    roundNo: latestRoundNo,
    roundStatus: activeRound ? 'active' : latestRoundNo ? 'closed' : 'not_started',
    roundEndsAt: activeRound?.endsAt ?? null,
    topPairs,
    totalPairs: duelPairs.length,
    totalSubmissions: submissions.length,
    updatedAt: new Date()
  };
}

```

## src/app/services/raidService.ts
```ts
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type PgBoss from 'pg-boss';
import {
  RAID_DAILY_OFFERS_COUNT,
  RAID_DAILY_PAIR_CAP_POINTS,
  RAID_DEFAULT_GOAL_POINTS,
} from '../../config/constants';
import { isFeatureEnabled } from '../../config/featureFlags';
import { requestRaidProgressRefresh } from '../projections/raidProjection';
import { requestPairHomeRefresh } from '../projections/pairHomeProjection';
import { addDays, dateOnly, startOfWeekIso } from '../../lib/time';
import { db } from '../../infra/db/drizzle';
import {
  guildSettings,
  pairs,
  raidClaims,
  raidDailyOffers,
  raidPairDailyTotals,
  raidQuests,
  raids,
} from '../../infra/db/schema';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { awardPairReward } from './rewardsService';

export function ensureRaidEnabled(): void {
  if (!isFeatureEnabled('raid')) {
    throw new Error('Raid feature is disabled');
  }
}

function hashNumber(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

function weekStartDateUtc(date: Date): string {
  return startOfWeekIso(date);
}

function weekEndAtUtc(weekStartDate: string): Date {
  return addDays(new Date(`${weekStartDate}T00:00:00.000Z`), 7);
}

export async function getActiveRaidForGuild(guildId: string) {
  const rows = await db
    .select()
    .from(raids)
    .where(and(eq(raids.guildId, guildId), eq(raids.status, 'active')))
    .orderBy(desc(raids.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function ensureDailyOffersForRaid(raidId: string, dayDate: string): Promise<string[]> {
  const existingRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  if (existingRows[0]) {
    const parsed = existingRows[0].questKeysJson;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }
  }

  const activeQuests = await db
    .select({
      key: raidQuests.key
    })
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  if (activeQuests.length === 0) {
    throw new Error('No active raid quests seeded');
  }

  const selected = [...activeQuests]
    .sort((a, b) => {
      const left = hashNumber(`${raidId}:${dayDate}:${a.key}`);
      const right = hashNumber(`${raidId}:${dayDate}:${b.key}`);
      if (left !== right) {
        return left - right;
      }
      return a.key.localeCompare(b.key);
    })
    .slice(0, Math.min(RAID_DAILY_OFFERS_COUNT, activeQuests.length))
    .map((row) => row.key);

  await db
    .insert(raidDailyOffers)
    .values({
      id: randomUUID(),
      raidId,
      dayDate,
      questKeysJson: selected
    })
    .onConflictDoNothing({
      target: [raidDailyOffers.raidId, raidDailyOffers.dayDate]
    });

  const afterInsertRows = await db
    .select()
    .from(raidDailyOffers)
    .where(and(eq(raidDailyOffers.raidId, raidId), eq(raidDailyOffers.dayDate, dayDate)))
    .limit(1);

  const afterInsert = afterInsertRows[0];
  if (!afterInsert) {
    throw new Error('Failed to create raid daily offers');
  }

  if (!Array.isArray(afterInsert.questKeysJson)) {
    throw new Error('Invalid raid daily offer payload');
  }

  return afterInsert.questKeysJson.filter((value): value is string => typeof value === 'string');
}

export async function generateDailyRaidOffers(now: Date = new Date()): Promise<number> {
  ensureRaidEnabled();
  const day = dateOnly(now);

  const activeRaids = await db
    .select()
    .from(raids)
    .where(and(eq(raids.status, 'active'), lte(raids.createdAt, now)));

  let generated = 0;

  for (const raid of activeRaids) {
    const beforeRows = await db
      .select({ id: raidDailyOffers.id })
      .from(raidDailyOffers)
      .where(and(eq(raidDailyOffers.raidId, raid.id), eq(raidDailyOffers.dayDate, day)))
      .limit(1);

    await ensureDailyOffersForRaid(raid.id, day);

    if (!beforeRows[0]) {
      generated += 1;
    }
  }

  return generated;
}

export async function startRaid(input: {
  guildId: string;
  publicChannelId: string;
  goalPoints?: number;
  createProgressMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId?: string;
  userId?: string;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const weekStartDate = weekStartDateUtc(now);
  const weekEndAt = weekEndAtUtc(weekStartDate);
  const goalPoints = input.goalPoints && input.goalPoints > 0 ? input.goalPoints : RAID_DEFAULT_GOAL_POINTS;

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext('raid.week.start')) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      throw new Error('Raid start is already in progress');
    }

    const existing = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.status, 'active')))
      .orderBy(desc(raids.createdAt))
      .limit(1);

    if (existing[0]) {
      return { raid: existing[0], created: false };
    }

    await tx
      .update(raids)
      .set({ status: 'ended' })
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate), eq(raids.status, 'active')));

    const inserted = await tx
      .insert(raids)
      .values({
        id: randomUUID(),
        guildId: input.guildId,
        status: 'active',
        weekStartDate,
        weekEndAt,
        goalPoints,
        progressPoints: 0,
        publicChannelId: input.publicChannelId
      })
      .onConflictDoNothing({
        target: [raids.guildId, raids.weekStartDate]
      })
      .returning();

    if (inserted[0]) {
      return { raid: inserted[0], created: true };
    }

    const afterConflict = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.guildId, input.guildId), eq(raids.weekStartDate, weekStartDate)))
      .limit(1);

    if (!afterConflict[0]) {
      throw new Error('Raid conflict but row not found');
    }

    return { raid: afterConflict[0], created: false };
  });

  if (!txResult.created) {
    return txResult;
  }

  const progressMessageId = await input.createProgressMessage('Initializing raid progress...');

  await db
    .update(raids)
    .set({ progressMessageId })
    .where(eq(raids.id, txResult.raid.id));

  await ensureDailyOffersForRaid(txResult.raid.id, dateOnly(now));

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raid.id,
    reason: 'raid_start',
    correlationId: input.correlationId
  });

  return {
    raid: {
      ...txResult.raid,
      progressMessageId
    },
    created: true
  };
}

export async function startWeeklyRaidsForConfiguredGuilds(input: {
  createProgressMessage: (params: { guildId: string; channelId: string; content: string }) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  now?: Date;
}) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  const guildRows = await db
    .select({
      guildId: guildSettings.guildId,
      raidChannelId: guildSettings.raidChannelId
    })
    .from(guildSettings)
    .where(isNotNull(guildSettings.raidChannelId));

  let created = 0;

  for (const guild of guildRows) {
    const channelId = guild.raidChannelId;
    if (!channelId) {
      continue;
    }

    const result = await startRaid({
      guildId: guild.guildId,
      publicChannelId: channelId,
      goalPoints: RAID_DEFAULT_GOAL_POINTS,
      createProgressMessage: (content) =>
        input.createProgressMessage({
          guildId: guild.guildId,
          channelId,
          content
        }),
      boss: input.boss,
      correlationId: input.correlationId,
      now
    });

    if (result.created) {
      created += 1;
    }
  }

  return created;
}

export async function endExpiredRaids(now: Date = new Date()): Promise<number> {
  ensureRaidEnabled();

  const ended = await db
    .update(raids)
    .set({ status: 'ended' })
    .where(and(eq(raids.status, 'active'), lte(raids.weekEndAt, now)))
    .returning({ id: raids.id });

  return ended.length;
}

export async function getTodayRaidOffers(guildId: string, now: Date = new Date()) {
  ensureRaidEnabled();

  const activeRaid = await getActiveRaidForGuild(guildId);
  if (!activeRaid) {
    throw new Error('No active raid found');
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(activeRaid.id, dayDate);
  if (offerKeys.length === 0) {
    return { raid: activeRaid, dayDate, offers: [] as Array<typeof raidQuests.$inferSelect> };
  }

  const allQuests = await db
    .select()
    .from(raidQuests)
    .where(eq(raidQuests.active, true));

  const byKey = new Map(allQuests.map((quest) => [quest.key, quest]));
  const offers = offerKeys.map((key) => byKey.get(key)).filter((value): value is typeof raidQuests.$inferSelect => Boolean(value));

  return { raid: activeRaid, dayDate, offers };
}

export async function claimRaidQuest(input: {
  guildId: string;
  userId: string;
  questKey: string;
  sendConfirmMessage: (params: {
    claimId: string;
    pairId: string;
    pairPrivateChannelId: string;
    claimerUserId: string;
    questKey: string;
    points: number;
  }) => Promise<void>;
  now?: Date;
}) {
  ensureRaidEnabled();

  const now = input.now ?? new Date();
  const dayDate = dateOnly(now);

  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    throw new Error('No active raid found');
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    throw new Error('Pair room not found for this user');
  }

  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);
  if (!offerKeys.includes(input.questKey)) {
    throw new Error('Quest is not in today offers');
  }

  const questRows = await db
    .select()
    .from(raidQuests)
    .where(and(eq(raidQuests.key, input.questKey), eq(raidQuests.active, true)))
    .limit(1);

  const quest = questRows[0];
  if (!quest) {
    throw new Error('Quest not found');
  }

  const inserted = await db
    .insert(raidClaims)
    .values({
      id: randomUUID(),
      raidId: raid.id,
      dayDate,
      pairId: pair.id,
      questKey: quest.key,
      status: 'pending_confirm',
      basePoints: quest.points,
      bonusPoints: 0,
      requestedByUserId: input.userId
    })
    .onConflictDoNothing({
      target: [raidClaims.raidId, raidClaims.dayDate, raidClaims.pairId, raidClaims.questKey]
    })
    .returning();

  const claim = inserted[0]
    ? inserted[0]
    : (
        await db
          .select()
          .from(raidClaims)
          .where(
            and(
              eq(raidClaims.raidId, raid.id),
              eq(raidClaims.dayDate, dayDate),
              eq(raidClaims.pairId, pair.id),
              eq(raidClaims.questKey, quest.key),
            ),
          )
          .limit(1)
      )[0];

  if (!claim) {
    throw new Error('Failed to create raid claim');
  }

  if (inserted[0]) {
    await input.sendConfirmMessage({
      claimId: claim.id,
      pairId: pair.id,
      pairPrivateChannelId: pair.privateChannelId,
      claimerUserId: input.userId,
      questKey: claim.questKey,
      points: claim.basePoints + claim.bonusPoints
    });
  }

  return { claim, created: Boolean(inserted[0]), pair, raid };
}

export async function confirmRaidClaim(input: {
  guildId: string;
  claimId: string;
  confirmerUserId: string;
  boss: PgBoss;
  correlationId: string;
}) {
  ensureRaidEnabled();

  const txResult = await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${input.guildId}), hashtext(${input.claimId})) as locked`,
    );

    if (!lockResult.rows[0]?.locked) {
      return { changed: false, appliedPoints: 0, reason: 'locked' as const, raidId: null, pair: null };
    }

    const claimRows = await tx
      .select()
      .from(raidClaims)
      .where(eq(raidClaims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) {
      throw new Error('Claim not found');
    }

    const raidRows = await tx
      .select()
      .from(raids)
      .where(and(eq(raids.id, claim.raidId), eq(raids.guildId, input.guildId)))
      .limit(1);
    const raid = raidRows[0];
    if (!raid) {
      throw new Error('Raid not found');
    }

    const pairRows = await tx
      .select()
      .from(pairs)
      .where(and(eq(pairs.id, claim.pairId), eq(pairs.guildId, input.guildId), eq(pairs.status, 'active')))
      .limit(1);
    const pair = pairRows[0];
    if (!pair) {
      throw new Error('Pair not found for claim');
    }

    if (pair.user1Id !== input.confirmerUserId && pair.user2Id !== input.confirmerUserId) {
      throw new Error('Only pair members can confirm');
    }

    if (claim.requestedByUserId && input.confirmerUserId === claim.requestedByUserId) {
      return { changed: false, appliedPoints: 0, reason: 'same_user' as const, raidId: raid.id, pair };
    }

    if (claim.status === 'confirmed' || claim.status === 'capped') {
      return { changed: false, appliedPoints: 0, reason: 'already_confirmed' as const, raidId: raid.id, pair };
    }

    const totalRows = await tx
      .select()
      .from(raidPairDailyTotals)
      .where(
        and(
          eq(raidPairDailyTotals.raidId, claim.raidId),
          eq(raidPairDailyTotals.dayDate, claim.dayDate),
          eq(raidPairDailyTotals.pairId, claim.pairId),
        ),
      )
      .limit(1);

    const currentTotal = totalRows[0]?.pointsTotal ?? 0;
    const claimPoints = claim.basePoints + claim.bonusPoints;
    const remaining = Math.max(0, RAID_DAILY_PAIR_CAP_POINTS - currentTotal);
    const appliedPoints = Math.max(0, Math.min(remaining, claimPoints));

    if (appliedPoints > 0) {
      await tx
        .insert(raidPairDailyTotals)
        .values({
          raidId: claim.raidId,
          dayDate: claim.dayDate,
          pairId: claim.pairId,
          pointsTotal: currentTotal + appliedPoints
        })
        .onConflictDoUpdate({
          target: [raidPairDailyTotals.raidId, raidPairDailyTotals.dayDate, raidPairDailyTotals.pairId],
          set: {
            pointsTotal: currentTotal + appliedPoints
          }
        });

      await tx
        .update(raids)
        .set({
          progressPoints: raid.progressPoints + appliedPoints
        })
        .where(eq(raids.id, raid.id));
    }

    await tx
      .update(raidClaims)
      .set({
        status: appliedPoints > 0 ? 'confirmed' : 'capped',
        confirmedByUserId: input.confirmerUserId,
        confirmedAt: new Date()
      })
      .where(eq(raidClaims.id, claim.id));

    return {
      changed: true,
      appliedPoints,
      reason: appliedPoints > 0 ? ('confirmed' as const) : ('capped' as const),
      raidId: raid.id,
      pair
    };
  });

  if (!txResult.raidId || !txResult.pair) {
    return txResult;
  }

  if (txResult.appliedPoints > 0) {
    await awardPairReward({
      guildId: input.guildId,
      pairId: txResult.pair.id,
      userIds: [txResult.pair.user1Id, txResult.pair.user2Id],
      kind: 'raid',
      amount: txResult.appliedPoints,
      key: `raid:${input.claimId}`,
      sourceType: 'raid_claim',
      sourceId: input.claimId
    });
  }

  await requestRaidProgressRefresh(input.boss, {
    guildId: input.guildId,
    raidId: txResult.raidId,
    reason: 'claim_confirm',
    correlationId: input.correlationId
  });

  await requestPairHomeRefresh(input.boss, {
    guildId: input.guildId,
    pairId: txResult.pair.id,
    reason: 'raid_claim_confirmed',
    correlationId: input.correlationId,
    userId: input.confirmerUserId
  });

  return txResult;
}

export type RaidProgressPair = {
  pairId: string;
  user1Id: string;
  user2Id: string;
  points: number;
};

export type RaidProgressSnapshot = {
  raidId: string;
  guildId: string;
  status: string;
  weekStartDate: string;
  weekEndAt: Date;
  goalPoints: number;
  progressPoints: number;
  participantsCount: number;
  publicChannelId: string;
  progressMessageId: string | null;
  todayOffers: Array<{ key: string; text: string; points: number }>;
  topPairs: RaidProgressPair[];
  updatedAt: Date;
};

export async function getRaidProgressSnapshot(input: { raidId?: string; guildId?: string; now?: Date }) {
  ensureRaidEnabled();
  const now = input.now ?? new Date();

  let raid: typeof raids.$inferSelect | null = null;
  if (input.raidId) {
    const rows = await db.select().from(raids).where(eq(raids.id, input.raidId)).limit(1);
    raid = rows[0] ?? null;
  } else if (input.guildId) {
    raid = await getActiveRaidForGuild(input.guildId);
  }

  if (!raid) {
    return null;
  }

  const dayDate = dateOnly(now);
  const offerKeys = await ensureDailyOffersForRaid(raid.id, dayDate);

  const offerRows = offerKeys.length
    ? await db.select().from(raidQuests).where(eq(raidQuests.active, true)).orderBy(asc(raidQuests.key))
    : [];
  const offerMap = new Map(offerRows.map((row) => [row.key, row]));
  const todayOffers = offerKeys
    .map((key) => offerMap.get(key))
    .filter((row): row is typeof raidQuests.$inferSelect => Boolean(row))
    .map((row) => ({
      key: row.key,
      text: row.text,
      points: row.points
    }));

  const totals = await db
    .select({
      pairId: raidPairDailyTotals.pairId,
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(eq(raidPairDailyTotals.raidId, raid.id))
    .groupBy(raidPairDailyTotals.pairId);

  const pairRows = await db
    .select()
    .from(pairs)
    .where(and(eq(pairs.guildId, raid.guildId), eq(pairs.status, 'active')));
  const pairMap = new Map(pairRows.map((row) => [row.id, row]));

  const topPairs = totals
    .map((total) => {
      const pair = pairMap.get(total.pairId);
      if (!pair) {
        return null;
      }

      return {
        pairId: pair.id,
        user1Id: pair.user1Id,
        user2Id: pair.user2Id,
        points: Number(total.points ?? 0)
      } satisfies RaidProgressPair;
    })
    .filter((value): value is RaidProgressPair => Boolean(value))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.pairId.localeCompare(b.pairId);
    });

  return {
    raidId: raid.id,
    guildId: raid.guildId,
    status: raid.status,
    weekStartDate: raid.weekStartDate,
    weekEndAt: raid.weekEndAt,
    goalPoints: raid.goalPoints,
    progressPoints: raid.progressPoints,
    participantsCount: pairRows.length,
    publicChannelId: raid.publicChannelId,
    progressMessageId: raid.progressMessageId ?? null,
    todayOffers,
    topPairs,
    updatedAt: new Date()
  } satisfies RaidProgressSnapshot;
}

export async function getRaidContributionForUser(input: {
  guildId: string;
  userId: string;
  now?: Date;
}): Promise<{
  raidId: string;
  pairId: string;
  todayPoints: number;
  weekPoints: number;
  dayDate: string;
} | null> {
  ensureRaidEnabled();
  const now = input.now ?? new Date();
  const raid = await getActiveRaidForGuild(input.guildId);
  if (!raid) {
    return null;
  }

  const pair = await getPairForUser(input.guildId, input.userId);
  if (!pair) {
    return null;
  }

  const dayDate = dateOnly(now);
  const todayRows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, raid.id),
        eq(raidPairDailyTotals.pairId, pair.id),
        eq(raidPairDailyTotals.dayDate, dayDate),
      ),
    )
    .limit(1);

  const weekRows = await db
    .select({
      points: sql<number>`coalesce(sum(${raidPairDailyTotals.pointsTotal}), 0)`
    })
    .from(raidPairDailyTotals)
    .where(and(eq(raidPairDailyTotals.raidId, raid.id), eq(raidPairDailyTotals.pairId, pair.id)));

  return {
    raidId: raid.id,
    pairId: pair.id,
    dayDate,
    todayPoints: todayRows[0]?.pointsTotal ?? 0,
    weekPoints: Number(weekRows[0]?.points ?? 0)
  };
}

export async function getRaidTodayPointsForPair(input: {
  raidId: string;
  pairId: string;
  dayDate: string;
}): Promise<number> {
  const rows = await db
    .select({ pointsTotal: raidPairDailyTotals.pointsTotal })
    .from(raidPairDailyTotals)
    .where(
      and(
        eq(raidPairDailyTotals.raidId, input.raidId),
        eq(raidPairDailyTotals.pairId, input.pairId),
        eq(raidPairDailyTotals.dayDate, input.dayDate),
      ),
    )
    .limit(1);

  return rows[0]?.pointsTotal ?? 0;
}

```

## src/discord/commands/pair.ts
```ts
import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import { pairCreateUsecase, pairRoomUsecase } from '../../app/usecases/pairUsecases';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { buildPairRoomOverwrites } from '../permissions/overwrites';
import type { CommandModule } from './types';

function roomName(userA: string, userB: string): string {
  const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return `pair-${sanitize(userA)}-${sanitize(userB)}`;
}

export const pairCommand: CommandModule = {
  name: 'pair',
  data: new SlashCommandBuilder()
    .setName('pair')
    .setDescription('Manage pair private rooms')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create or return a private pair room')
        .addUserOption((opt) => opt.setName('user').setDescription('Second user').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('room').setDescription('Get your pair private room link')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const correlationId = createCorrelationId();

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user', true);
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const botUserId = interaction.client.user?.id;
      if (!botUserId) {
        throw new Error('Bot user not available');
      }

      const result = await pairCreateUsecase({
        guildId: interaction.guildId,
        userA: interaction.user.id,
        userB: targetUser.id,
        createPrivateChannel: async ([userLow, userHigh]) => {
          const lowMember = await interaction.guild.members.fetch(userLow);
          const highMember = await interaction.guild.members.fetch(userHigh);

          const channel = await interaction.guild.channels.create({
            name: roomName(lowMember.displayName, highMember.displayName),
            type: ChannelType.GuildText,
            permissionOverwrites: buildPairRoomOverwrites({
              guildId: interaction.guildId,
              botUserId,
              memberIds: [userLow, userHigh],
              moderatorRoleId: settings?.moderatorRoleId ?? null
            }),
            reason: `Pair room for ${userLow} and ${userHigh}`
          });

          return channel.id;
        }
      });

      logInteraction({
        interaction,
        feature: 'pair',
        action: 'create',
        correlationId,
        pairId: result.pair.id
      });

      const prefix = result.created ? 'Created' : 'Existing';
      await interaction.editReply(
        `${prefix} pair room: <#${result.pair.privateChannelId}> for <@${result.pair.user1Id}> + <@${result.pair.user2Id}>`,
      );

      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: result.pair.id,
        reason: result.created ? 'pair_created' : 'pair_room_opened',
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });
      return;
    }

    if (subcommand === 'room') {
      await interaction.deferReply({ ephemeral: true });

      const pair = await pairRoomUsecase(interaction.guildId, interaction.user.id);
      logInteraction({
        interaction,
        feature: 'pair',
        action: 'room_lookup',
        correlationId,
        pairId: pair?.id ?? null
      });

      if (!pair) {
        await interaction.editReply('No active pair room found for you.');
        return;
      }

      await interaction.editReply(`Your pair room: <#${pair.privateChannelId}>`);
      return;
    }

    await interaction.reply({ ephemeral: true, content: 'Unknown pair subcommand.' });
  }
};

```

## src/discord/setupWizard/state.ts
```ts
import type { getGuildSettings } from '../../infra/db/queries/guildSettings';

type GuildSettingsRow = Awaited<ReturnType<typeof getGuildSettings>>;

const DRAFT_TTL_MS = 30 * 60 * 1000;

export type SetupWizardDraft = {
  guildId: string;
  userId: string;
  duelPublicChannelId: string | null;
  oracleChannelId: string | null;
  questionsChannelId: string | null;
  raidChannelId: string | null;
  moderatorRoleId: string | null;
  updatedAtMs: number;
};

const drafts = new Map<string, SetupWizardDraft>();

function keyOf(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function nowMs(): number {
  return Date.now();
}

function pruneExpiredDrafts(now: number): void {
  for (const [key, draft] of drafts) {
    if (now - draft.updatedAtMs > DRAFT_TTL_MS) {
      drafts.delete(key);
    }
  }
}

function toDraft(guildId: string, userId: string, settings: GuildSettingsRow): SetupWizardDraft {
  return {
    guildId,
    userId,
    duelPublicChannelId: settings?.duelPublicChannelId ?? null,
    oracleChannelId: settings?.oracleChannelId ?? null,
    questionsChannelId: settings?.questionsChannelId ?? null,
    raidChannelId: settings?.raidChannelId ?? null,
    moderatorRoleId: settings?.moderatorRoleId ?? null,
    updatedAtMs: nowMs()
  };
}

export function ensureSetupWizardDraft(
  guildId: string,
  userId: string,
  settings: GuildSettingsRow,
): SetupWizardDraft {
  const now = nowMs();
  pruneExpiredDrafts(now);

  const key = keyOf(guildId, userId);
  const existing = drafts.get(key);
  if (existing) {
    existing.updatedAtMs = now;
    drafts.set(key, existing);
    return existing;
  }

  const created = toDraft(guildId, userId, settings);
  drafts.set(key, created);
  return created;
}

export function resetSetupWizardDraft(
  guildId: string,
  userId: string,
  settings: GuildSettingsRow,
): SetupWizardDraft {
  const draft = toDraft(guildId, userId, settings);
  drafts.set(keyOf(guildId, userId), draft);
  return draft;
}

export function getSetupWizardDraft(guildId: string, userId: string): SetupWizardDraft | null {
  const now = nowMs();
  pruneExpiredDrafts(now);

  const draft = drafts.get(keyOf(guildId, userId)) ?? null;
  if (!draft) {
    return null;
  }

  draft.updatedAtMs = now;
  drafts.set(keyOf(guildId, userId), draft);
  return draft;
}

export function patchSetupWizardDraft(
  guildId: string,
  userId: string,
  patch: Partial<Omit<SetupWizardDraft, 'guildId' | 'userId' | 'updatedAtMs'>>,
): SetupWizardDraft {
  const current = drafts.get(keyOf(guildId, userId));
  if (!current) {
    throw new Error('Setup wizard draft not found. Run /setup first.');
  }

  const next: SetupWizardDraft = {
    ...current,
    ...patch,
    updatedAtMs: nowMs()
  };

  drafts.set(keyOf(guildId, userId), next);
  return next;
}

export function clearSetupWizardDraft(guildId: string, userId: string): void {
  drafts.delete(keyOf(guildId, userId));
}

```

## src/discord/setupWizard/view.ts
```ts
import {
  actionRowButtons,
  actionRowSelects,
  ButtonStyle,
  ChannelType,
  ComponentType,
  textBlock,
  uiCard,
  type ComponentsV2Message,
} from '../ui-v2';

import { encodeCustomId } from '../interactions/customId';
import type { SetupWizardDraft } from './state';

function channelLine(label: string, channelId: string | null): string {
  return `${label}: ${channelId ? `<#${channelId}>` : '_not set_'}`;
}

function roleLine(roleId: string | null): string {
  return `Moderator role: ${roleId ? `<@&${roleId}>` : '_not set_'}`;
}

function setupCustomId(action: string): string {
  return encodeCustomId({
    feature: 'setup_wizard',
    action,
    payload: {}
  });
}

function channelSelect(action: string, placeholder: string) {
  return actionRowSelects([
    {
      type: ComponentType.ChannelSelect,
      custom_id: setupCustomId(action),
      placeholder,
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
    }
  ]);
}

export function renderSetupWizardPanel(draft: SetupWizardDraft): ComponentsV2Message {
  const summary = [
    'Pick channels and role below, then press Save.',
    '',
    channelLine('Duel scoreboard', draft.duelPublicChannelId),
    channelLine('Weekly oracle', draft.oracleChannelId),
    channelLine('Questions inbox', draft.questionsChannelId),
    channelLine('Raid progress', draft.raidChannelId),
    roleLine(draft.moderatorRoleId),
  ].join('\n');

  return {
    components: [
      uiCard({
        title: 'Setup Wizard',
        status: draft.guildId,
        accentColor: 0x3d5a80,
        components: [
          textBlock(summary),
          channelSelect('pick_duel_channel', 'Select duel scoreboard channel'),
          channelSelect('pick_oracle_channel', 'Select weekly oracle channel'),
          channelSelect('pick_questions_channel', 'Select questions channel'),
          channelSelect('pick_raid_channel', 'Select raid progress channel'),
          actionRowSelects([
            {
              type: ComponentType.RoleSelect,
              custom_id: setupCustomId('pick_mod_role'),
              placeholder: 'Select optional moderator role',
              min_values: 0,
              max_values: 1,
            }
          ]),
          actionRowButtons([
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              custom_id: setupCustomId('save'),
              label: 'Save'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              custom_id: setupCustomId('reset'),
              label: 'Reset'
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: setupCustomId('test_post'),
              label: 'Test Post'
            }
          ])
        ]
      })
    ]
  };
}

```

## src/discord/commands/setup.ts
```ts
import { SlashCommandBuilder } from 'discord.js';
import { createCorrelationId } from '../../lib/correlation';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { logInteraction } from '../interactionLog';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import { ensureSetupWizardDraft } from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';
import type { CommandModule } from './types';

export const setupCommand: CommandModule = {
  name: 'setup',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open setup wizard for guild bot settings'),
  async execute(_ctx, interaction) {
    assertGuildOnly(interaction);

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        ephemeral: true,
        content: 'Administrator permission is required for setup wizard.'
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    const draft = ensureSetupWizardDraft(interaction.guildId, interaction.user.id, settings);
    const panel = renderSetupWizardPanel(draft);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'open_wizard',
      correlationId
    });

    await interaction.editReply({
      content: panel.content ?? null,
      components: panel.components as never,
      flags: COMPONENTS_V2_FLAGS
    } as never);
  }
};

```

## src/discord/interactions/setupWizard.ts
```ts
import { PermissionFlagsBits, type ButtonInteraction, type ChannelSelectMenuInteraction, type RoleSelectMenuInteraction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { createScheduledPost } from '../../app/services/publicPostService';
import { setGuildSettings } from '../../app/services/setupService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import type { CustomIdEnvelope } from './customId';
import { COMPONENTS_V2_FLAGS } from '../ui-v2';
import {
  ensureSetupWizardDraft,
  getSetupWizardDraft,
  patchSetupWizardDraft,
  resetSetupWizardDraft,
  type SetupWizardDraft,
} from '../setupWizard/state';
import { renderSetupWizardPanel } from '../setupWizard/view';

export type SetupWizardInteraction = ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction;

const actionSchema = z.enum([
  'pick_duel_channel',
  'pick_oracle_channel',
  'pick_questions_channel',
  'pick_raid_channel',
  'pick_mod_role',
  'save',
  'reset',
  'test_post'
]);

function isAdmin(interaction: SetupWizardInteraction): boolean {
  return interaction.inCachedGuild()
    && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

async function ensureDraft(interaction: SetupWizardInteraction): Promise<SetupWizardDraft> {
  const existing = getSetupWizardDraft(interaction.guildId ?? '', interaction.user.id);
  if (existing) {
    return existing;
  }

  if (!interaction.guildId) {
    throw new Error('Guild-only action');
  }

  const settings = await getGuildSettings(interaction.guildId);
  return ensureSetupWizardDraft(interaction.guildId, interaction.user.id, settings);
}

async function updatePanel(interaction: SetupWizardInteraction, draft: SetupWizardDraft): Promise<void> {
  const panel = renderSetupWizardPanel(draft);
  await interaction.editReply({
    content: panel.content ?? null,
    components: panel.components as never,
    flags: COMPONENTS_V2_FLAGS
  } as never);
}

function selectTargetChannel(draft: SetupWizardDraft): string | null {
  return draft.duelPublicChannelId
    ?? draft.raidChannelId
    ?? draft.oracleChannelId
    ?? draft.questionsChannelId
    ?? null;
}

function testPostContent(guildId: string): string {
  return [
    '## Setup Wizard Test Post',
    `Guild: \`${guildId}\``,
    'This message confirms that scheduled posting and publish queue are wired correctly.'
  ].join('\n');
}

export async function handleSetupWizardComponent(
  ctx: { boss: PgBoss },
  interaction: SetupWizardInteraction,
  decoded: CustomIdEnvelope,
): Promise<boolean> {
  if (decoded.feature !== 'setup_wizard') {
    return false;
  }

  const action = actionSchema.parse(decoded.action);

  if (!interaction.guildId) {
    await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
    return true;
  }

  if (!isAdmin(interaction)) {
    await interaction.reply({ ephemeral: true, content: 'Administrator permission is required for setup wizard.' });
    return true;
  }

  await interaction.deferUpdate();

  const correlationId = createCorrelationId();

  if (action.startsWith('pick_')) {
    await ensureDraft(interaction);

    if (action === 'pick_mod_role') {
      if (!interaction.isRoleSelectMenu()) {
        await interaction.followUp({ ephemeral: true, content: 'Use the role selector for this action.' });
        return true;
      }

      const roleId = interaction.values[0] ?? null;
      const draft = patchSetupWizardDraft(interaction.guildId, interaction.user.id, {
        moderatorRoleId: roleId
      });

      await updatePanel(interaction, draft);
      await interaction.followUp({ ephemeral: true, content: 'Draft updated.' });
      return true;
    }

    if (!interaction.isChannelSelectMenu()) {
      await interaction.followUp({ ephemeral: true, content: 'Use a channel selector for this action.' });
      return true;
    }

    const channelId = interaction.values[0] ?? null;

    const patch = action === 'pick_duel_channel'
      ? { duelPublicChannelId: channelId }
      : action === 'pick_oracle_channel'
        ? { oracleChannelId: channelId }
        : action === 'pick_questions_channel'
          ? { questionsChannelId: channelId }
          : { raidChannelId: channelId };

    const next = patchSetupWizardDraft(interaction.guildId, interaction.user.id, patch);

    await updatePanel(interaction, next);
    await interaction.followUp({ ephemeral: true, content: 'Draft updated.' });
    return true;
  }

  if (!interaction.isButton()) {
    await interaction.followUp({ ephemeral: true, content: 'Unsupported setup wizard action.' });
    return true;
  }

  const draft = await ensureDraft(interaction);

  if (action === 'save') {
    await setGuildSettings(interaction.guildId, {
      duelPublicChannelId: draft.duelPublicChannelId,
      oracleChannelId: draft.oracleChannelId,
      questionsChannelId: draft.questionsChannelId,
      raidChannelId: draft.raidChannelId,
      moderatorRoleId: draft.moderatorRoleId
    });

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_save',
      correlationId
    });

    await updatePanel(interaction, draft);
    await interaction.followUp({ ephemeral: true, content: 'Guild settings saved.' });
    return true;
  }

  if (action === 'reset') {
    const settings = await getGuildSettings(interaction.guildId);
    const resetDraft = resetSetupWizardDraft(interaction.guildId, interaction.user.id, settings);

    logInteraction({
      interaction,
      feature: 'setup',
      action: 'wizard_reset',
      correlationId
    });

    await updatePanel(interaction, resetDraft);
    await interaction.followUp({ ephemeral: true, content: 'Draft reset to stored settings.' });
    return true;
  }

  const channelId = selectTargetChannel(draft);
  if (!channelId) {
    await interaction.followUp({
      ephemeral: true,
      content: `Preview:\n\n${testPostContent(interaction.guildId)}`
    });
    return true;
  }

  const now = new Date();
  const dedupeWindow = Math.floor(now.getTime() / 60_000);
  const scheduled = await createScheduledPost({
    guildId: interaction.guildId,
    type: 'text',
    targetChannelId: channelId,
    payloadJson: {
      content: testPostContent(interaction.guildId)
    },
    scheduledFor: now,
    idempotencyKey: `setup:test:${interaction.guildId}:${interaction.user.id}:${dedupeWindow}`
  });

  await requestPublicPostPublish(ctx.boss, {
    guildId: interaction.guildId,
    scheduledPostId: scheduled.id,
    reason: 'setup_test_post',
    interactionId: interaction.id,
    userId: interaction.user.id,
    correlationId
  });

  logInteraction({
    interaction,
    feature: 'setup',
    action: 'wizard_test_post',
    correlationId,
    jobId: null
  });

  await interaction.followUp({
    ephemeral: true,
    content: scheduled.created
      ? `Test post queued for <#${channelId}>.`
      : `Test post already queued for <#${channelId}> in this minute.`,
  });

  await updatePanel(interaction, draft);
  return true;
}

```

## src/discord/interactions/router.ts
```ts
import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  Client,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type PgBoss from 'pg-boss';
import { z } from 'zod';
import { requestPublicPostPublish } from '../../app/projections/publicPostProjection';
import { requestPairHomeRefresh } from '../../app/projections/pairHomeProjection';
import {
  getPairForCheckinChannel,
  listActiveAgreements,
  scheduleCheckinAgreementShare,
  submitWeeklyCheckin,
} from '../../app/services/checkinService';
import { getPairHomeSnapshot } from '../../app/services/pairHomeService';
import { duelSubmitUsecase } from '../../app/usecases/duelUsecases';
import { createCorrelationId } from '../../lib/correlation';
import { logger } from '../../lib/logger';
import { logInteraction } from '../interactionLog';
import {
  buildCheckinAgreementSelect,
  buildCheckinShareButton,
  buildCheckinSubmitModal,
  buildDuelSubmissionModal,
  buildOracleClaimModal,
  buildRaidClaimButton,
  buildRaidConfirmButton
} from './components';
import { decodeCustomId } from './customId';
import {
  approveAnonQuestion,
  createAnonQuestion,
  rejectAnonQuestion
} from '../../app/services/anonService';
import {
  claimOracle,
  markOracleClaimDelivery,
  parseOracleContext,
  parseOracleMode
} from '../../app/services/oracleService';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { claimRaidQuest, confirmRaidClaim, getRaidContributionForUser, getTodayRaidOffers } from '../../app/services/raidService';
import { handleSetupWizardComponent } from './setupWizard';

export type InteractionContext = {
  client: Client;
  boss: PgBoss;
};

function isAdminOrConfiguredModeratorForComponent(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
  moderatorRoleId?: string | null,
): boolean {
  if (!interaction.inCachedGuild()) {
    return false;
  }

  if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!moderatorRoleId) {
    return false;
  }

  return interaction.member.roles.cache.has(moderatorRoleId);
}

const duelBoardPayloadSchema = z.object({ d: z.string().min(1) });
const raidBoardPayloadSchema = z.object({ r: z.string().min(1) });
const pairHomePayloadSchema = z.object({ p: z.string().uuid() });

async function handleButton(ctx: InteractionContext, interaction: ButtonInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'setup_wizard') {
    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'rules') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Rules: one submission per pair per active round. A moderator starts and closes rounds. ' +
        'Pair totals rank by points first and pair id as deterministic tiebreaker.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'participate') {
    duelBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'How to participate: join your pair room, wait for a round start message, press Submit answer, ' +
        'then complete the modal once before the timer ends.',
    });
    return;
  }

  if (decoded.feature === 'duel_board' && decoded.action === 'open_room') {
    duelBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair ? `Your pair room: <#${pair.privateChannelId}>` : 'You do not have an active pair room yet.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'rules') {
    raidBoardPayloadSchema.parse(decoded.payload);
    await interaction.reply({
      ephemeral: true,
      content:
        'Raid rules: claim one of today quests, then your partner confirms in the pair room. ' +
        'Daily pair cap applies automatically.',
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'take_quests') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'raid_board' && decoded.action === 'my_contribution') {
    raidBoardPayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const contribution = await getRaidContributionForUser({
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!contribution) {
      await interaction.editReply('No active raid contribution found for your pair yet.');
      return;
    }

    await interaction.editReply(
      `My contribution (${contribution.dayDate}): **${contribution.todayPoints}** today, ` +
      `**${contribution.weekPoints}** this raid week.`,
    );
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'checkin') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });

    if (!pair || pair.id !== payload.p) {
      await interaction.editReply('Run check-in from your pair room panel only.');
      return;
    }

    const agreements = await listActiveAgreements(25);
    if (agreements.length === 0) {
      await interaction.editReply('No active agreements found. Run seed script first.');
      return;
    }

    await interaction.editReply({
      content: 'Select one weekly agreement, then fill the 5-score modal.',
      components: [
        buildCheckinAgreementSelect(agreements.map((agreement) => ({ key: agreement.key, text: agreement.text }))) as never
      ]
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'raid') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    if (!pair || pair.id !== payload.p) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for your active pair.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const data = await getTodayRaidOffers(interaction.guildId);
    if (data.offers.length === 0) {
      await interaction.editReply('No raid offers found for today.');
      return;
    }

    const lines = data.offers.map(
      (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
    );

    await interaction.editReply({
      content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
      components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
    });
    return;
  }

  if (decoded.feature === 'pair_home' && decoded.action === 'duel_info') {
    const payload = pairHomePayloadSchema.parse(decoded.payload);
    const snapshot = await getPairHomeSnapshot(payload.p);
    if (!snapshot) {
      await interaction.reply({ ephemeral: true, content: 'Pair panel is not available.' });
      return;
    }

    if (snapshot.user1Id !== interaction.user.id && snapshot.user2Id !== interaction.user.id) {
      await interaction.reply({ ephemeral: true, content: 'This panel action is only for pair members.' });
      return;
    }

    const text = !snapshot.duel.active
      ? 'No active duel right now.'
      : !snapshot.duel.roundNo
        ? 'Duel is active but no round is running right now.'
        : `Round #${snapshot.duel.roundNo} is active${snapshot.duel.roundEndsAt
          ? ` and ends <t:${Math.floor(snapshot.duel.roundEndsAt.getTime() / 1000)}:R>`
          : ''}.`;
    await interaction.reply({ ephemeral: true, content: text });
    return;
  }

  if (decoded.feature === 'duel' && decoded.action === 'open_submit_modal') {
    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel payload.' });
      return;
    }

    const modal = buildDuelSubmissionModal({ duelId, roundId, pairId });
    await interaction.showModal(modal as never);

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'open_submit_modal',
      correlationId,
      pairId
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_open') {
    const guildId = decoded.payload.g;
    const weekStartDate = decoded.payload.w;
    if (!guildId || !weekStartDate) {
      await interaction.reply({ ephemeral: true, content: 'Malformed oracle payload.' });
      return;
    }

    const modal = buildOracleClaimModal(guildId, weekStartDate);
    await interaction.showModal(modal as never);
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'about') {
    await interaction.reply({
      ephemeral: true,
      content:
        'Weekly oracle is deterministic and built from seeded templates. ' +
        'No runtime LLM generation is used in production loops.',
    });
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'start_pair_ritual') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    await interaction.reply({
      ephemeral: true,
      content: pair
        ? `Start ritual in your pair room: <#${pair.privateChannelId}>`
        : 'Create a pair room first with `/pair create`, then start the ritual there.',
    });
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'share_agreement') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const checkinId = decoded.payload.c;
    if (!checkinId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const shared = await scheduleCheckinAgreementShare({
      guildId: interaction.guildId,
      checkinId,
      requesterUserId: interaction.user.id
    });

    await requestPublicPostPublish(ctx.boss, {
      guildId: interaction.guildId,
      scheduledPostId: shared.scheduledPostId,
      reason: 'checkin_share',
      interactionId: interaction.id,
      userId: interaction.user.id,
      correlationId
    });

    await interaction.editReply(
      shared.created
        ? 'Agreement queued for public posting.'
        : 'Agreement share was already queued earlier.',
    );
    return;
  }

  if (decoded.feature === 'anon' && (decoded.action === 'approve' || decoded.action === 'reject')) {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questionId = decoded.payload.q;
    if (!questionId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed anon moderation payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const settings = await getGuildSettings(interaction.guildId);
    if (!isAdminOrConfiguredModeratorForComponent(interaction, settings?.moderatorRoleId ?? null)) {
      await interaction.editReply('Admin or configured moderator role is required.');
      return;
    }

    if (decoded.action === 'approve') {
      const approved = await approveAnonQuestion({
        guildId: interaction.guildId,
        questionId,
        moderatorUserId: interaction.user.id
      });

      if (approved.changed && approved.scheduledPostId) {
        await requestPublicPostPublish(ctx.boss, {
          guildId: interaction.guildId,
          scheduledPostId: approved.scheduledPostId,
          reason: 'anon_approve',
          interactionId: interaction.id,
          userId: interaction.user.id,
          correlationId
        });
      }

      await interaction.editReply(
        approved.changed
          ? 'Question approved and queued for publishing.'
          : 'Question already moderated.',
      );
      return;
    }

    const rejected = await rejectAnonQuestion({
      guildId: interaction.guildId,
      questionId,
      moderatorUserId: interaction.user.id
    });

    await interaction.editReply(rejected.changed ? 'Question rejected.' : 'Question already moderated.');
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'claim') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const questKey = decoded.payload.q;
    if (!questKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid claim payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await claimRaidQuest({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      questKey,
      sendConfirmMessage: async (params) => {
        const channel = await interaction.client.channels.fetch(params.pairPrivateChannelId);
        if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
          throw new Error('Pair room channel is not sendable');
        }

        await channel.send({
          content:
            `<@${params.claimerUserId}> claimed **${params.questKey}** for ${params.points} points.\n` +
            'Partner, press confirm when completed.',
          components: [buildRaidConfirmButton(params.claimId) as never]
        });
      }
    });

    await interaction.editReply(
      result.created
        ? `Claim created for **${questKey}**. Confirmation sent to your pair room.`
        : `Claim for **${questKey}** already exists today.`,
    );
    return;
  }

  if (decoded.feature === 'raid' && decoded.action === 'confirm') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const claimId = decoded.payload.c;
    if (!claimId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed raid confirm payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await confirmRaidClaim({
      guildId: interaction.guildId,
      claimId,
      confirmerUserId: interaction.user.id,
      boss: ctx.boss,
      correlationId
    });

    if (!result.changed && result.reason === 'same_user') {
      await interaction.editReply('The same user who claimed cannot confirm. Ask your partner to confirm.');
      return;
    }

    if (!result.changed && result.reason === 'already_confirmed') {
      await interaction.editReply('This claim was already confirmed.');
      return;
    }

    if (!result.changed) {
      await interaction.editReply('Claim confirmation is already in progress. Try again shortly.');
      return;
    }

    await interaction.editReply(
      result.appliedPoints > 0
        ? `Claim confirmed. +${result.appliedPoints} raid points applied.`
        : 'Daily cap reached for this pair. Claim marked as capped.',
    );
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported action.' });
}

function parseCheckinScores(interaction: ModalSubmitInteraction): [number, number, number, number, number] {
  const raw = ['s1', 's2', 's3', 's4', 's5'].map((field) => interaction.fields.getTextInputValue(field).trim());
  const values = raw.map((value) => Number.parseInt(value, 10));

  if (values.some((value) => Number.isNaN(value))) {
    throw new Error('Each score must be an integer.');
  }

  return values as [number, number, number, number, number];
}

async function handleModal(ctx: InteractionContext, interaction: ModalSubmitInteraction): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);
  const correlationId = createCorrelationId();

  if (decoded.feature === 'duel' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const duelId = decoded.payload.duelId;
    const roundId = decoded.payload.roundId;
    const pairId = decoded.payload.pairId;

    if (!duelId || !roundId || !pairId) {
      await interaction.reply({ ephemeral: true, content: 'Malformed duel submission payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const answer = interaction.fields.getTextInputValue('answer');
    const result = await duelSubmitUsecase({
      guildId: interaction.guildId,
      duelId,
      roundId,
      pairId,
      answer,
      userId: interaction.user.id,
      correlationId,
      interactionId: interaction.id,
      boss: ctx.boss
    });

    logInteraction({
      interaction,
      feature: 'duel',
      action: 'submit_modal',
      correlationId,
      pairId,
      jobId: null
    });

    await interaction.editReply(
      result.accepted
        ? 'Submission accepted. Scoreboard will refresh shortly.'
        : 'You already submitted for this round. Keeping your first submission.',
    );
    return;
  }

  if (decoded.feature === 'anon' && decoded.action === 'ask_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const question = interaction.fields.getTextInputValue('question');
    const created = await createAnonQuestion({
      guildId: interaction.guildId,
      authorUserId: interaction.user.id,
      questionText: question
    });

    logInteraction({
      interaction,
      feature: 'anon',
      action: 'ask_submit',
      correlationId
    });

    await interaction.editReply(`Question queued for moderation. Request id: \`${created.id}\``);
    return;
  }

  if (decoded.feature === 'oracle' && decoded.action === 'claim_submit') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const modeInput = interaction.fields.getTextInputValue('mode');
    const contextInput = interaction.fields.getTextInputValue('context');
    const mode = parseOracleMode(modeInput);
    const context = parseOracleContext(contextInput);
    if (!mode || !context) {
      await interaction.editReply(
        'Invalid mode/context. Use mode: soft/neutral/hard and context: conflict/ok/boredom/distance/fatigue/jealousy.',
      );
      return;
    }

    const pair = await getPairForUser(interaction.guildId, interaction.user.id);
    const claimed = await claimOracle({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      pairId: pair?.id ?? null,
      mode,
      context
    });

    let delivered: 'dm' | 'pair' | 'ephemeral' = 'ephemeral';

    try {
      await interaction.user.send(claimed.text);
      delivered = 'dm';
    } catch {
      if (pair) {
        const channel = await interaction.client.channels.fetch(pair.privateChannelId);
        if (channel?.isTextBased() && 'send' in channel && typeof channel.send === 'function') {
          await channel.send({
            content: `<@${interaction.user.id}> weekly oracle:\n\n${claimed.text}`
          });
          delivered = 'pair';
        }
      }
    }

    await markOracleClaimDelivery(claimed.claim.id, delivered);

    const deliveryText = delivered === 'dm'
      ? 'Delivered to your DM.'
      : delivered === 'pair'
        ? 'DM unavailable, delivered to your pair room.'
        : `DM and pair-room fallback unavailable, showing here:\n\n${claimed.text}`;

    await interaction.editReply(
      claimed.created
        ? `Oracle claimed. ${deliveryText}`
        : `You already claimed this week. ${deliveryText}`,
    );
    return;
  }

  if (decoded.feature === 'checkin' && decoded.action === 'submit_modal') {
    if (!interaction.guildId) {
      await interaction.reply({ ephemeral: true, content: 'Guild-only action.' });
      return;
    }

    const agreementKey = decoded.payload.a;
    if (!agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in payload.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    if (!interaction.channelId) {
      await interaction.editReply('Unable to resolve channel for check-in submission.');
      return;
    }

    const pair = await getPairForCheckinChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id
    });
    if (!pair) {
      await interaction.editReply('Run check-in flow inside your pair room.');
      return;
    }

    const scores = parseCheckinScores(interaction);
    const result = await submitWeeklyCheckin({
      guildId: interaction.guildId,
      pairId: pair.id,
      userId: interaction.user.id,
      agreementKey,
      scores
    });

    logInteraction({
      interaction,
      feature: 'checkin',
      action: 'submit_modal',
      correlationId,
      pairId: pair.id
    });

    if (result.created) {
      await requestPairHomeRefresh(ctx.boss, {
        guildId: interaction.guildId,
        pairId: pair.id,
        reason: 'checkin_saved',
        interactionId: interaction.id,
        userId: interaction.user.id,
        correlationId
      });
    }

    await interaction.editReply({
      content: result.created
        ? 'Weekly check-in submitted. You can optionally share agreement publicly.'
        : 'Check-in already exists for this pair/week. Showing the existing record.',
      components: [buildCheckinShareButton(result.checkin.id) as never]
    });
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported modal action.' });
}

async function handleSelect(
  ctx: InteractionContext,
  interaction: StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
): Promise<void> {
  const decoded = decodeCustomId(interaction.customId);

  if (decoded.feature === 'setup_wizard') {
    if (!interaction.isChannelSelectMenu() && !interaction.isRoleSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported setup wizard selector.' });
      return;
    }

    const handled = await handleSetupWizardComponent(ctx, interaction, decoded);
    if (handled) {
      return;
    }
  }

  if (decoded.feature === 'checkin' && decoded.action === 'agreement_select') {
    if (!interaction.isStringSelectMenu()) {
      await interaction.reply({ ephemeral: true, content: 'Unsupported check-in selector.' });
      return;
    }

    const agreementKey = interaction.values[0];

    if (!interaction.guildId || !agreementKey) {
      await interaction.reply({ ephemeral: true, content: 'Malformed check-in selection payload.' });
      return;
    }

    const modal = buildCheckinSubmitModal(agreementKey);
    await interaction.showModal(modal as never);
    return;
  }

  await interaction.reply({ ephemeral: true, content: 'Unsupported select action.' });
}

export async function routeInteractionComponent(
  ctx: InteractionContext,
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction,
): Promise<void> {
  try {
    if (interaction.isButton()) {
      await handleButton(ctx, interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(ctx, interaction);
      return;
    }

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
      await handleSelect(ctx, interaction);
    }
  } catch (error) {
    logger.error({ error, interaction_id: interaction.id }, 'Interaction component routing failed');

    if (interaction.deferred) {
      await interaction.editReply('Interaction failed. Please try again.');
      return;
    }

    if (!interaction.replied) {
      await interaction.reply({ ephemeral: true, content: 'Interaction failed. Please try again.' });
    }
  }
}

```

## src/discord/client.ts
```ts
import { Client, Events, GatewayIntentBits, type Interaction } from 'discord.js';
import type PgBoss from 'pg-boss';
import { handleChatInputCommand } from './commands';
import type { CommandContext } from './commands/types';
import { routeInteractionComponent } from './interactions/router';
import { logger } from '../lib/logger';

type CreateDiscordClientParams = {
  token: string;
  boss: PgBoss;
};

export type DiscordRuntime = {
  client: Client;
  login: () => Promise<void>;
  destroy: () => Promise<void>;
  isReady: () => boolean;
};

export function createDiscordRuntime(params: CreateDiscordClientParams): DiscordRuntime {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  let ready = false;

  client.once(Events.ClientReady, (c) => {
    ready = true;
    logger.info({ feature: 'discord', bot_user_id: c.user.id, guild_count: c.guilds.cache.size }, 'Discord ready');
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    ready = false;
    logger.warn({ feature: 'discord', shard_id: shardId, code: event.code }, 'Discord shard disconnected');
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    ready = true;
    logger.info({ feature: 'discord', shard_id: shardId, replayed_events: replayedEvents }, 'Discord shard resumed');
  });

  const commandContext: CommandContext = {
    client,
    boss: params.boss
  };

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(commandContext, interaction);
      return;
    }

    if (
      interaction.isButton()
      || interaction.isModalSubmit()
      || interaction.isStringSelectMenu()
      || interaction.isChannelSelectMenu()
      || interaction.isRoleSelectMenu()
    ) {
      await routeInteractionComponent(
        {
          client,
          boss: params.boss
        },
        interaction,
      );
    }
  });

  return {
    client,
    async login() {
      await client.login(params.token);
    },
    async destroy() {
      await client.destroy();
      ready = false;
    },
    isReady() {
      return ready;
    }
  };
}

```

## src/discord/commands/raid.ts
```ts
import { SlashCommandBuilder, type MessageCreateOptions } from 'discord.js';
import {
  ensureRaidEnabled,
  getRaidProgressSnapshot,
  getTodayRaidOffers,
  startRaid,
} from '../../app/services/raidService';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { buildRaidClaimButton } from '../interactions/components';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { renderRaidProgressText } from '../projections/raidProgressRenderer';
import { sendComponentsV2Message, textBlock, uiCard } from '../ui-v2';
import type { CommandModule } from './types';

function canSend(channel: unknown): channel is {
  id: string;
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  if (!channel || typeof channel !== 'object') {
    return false;
  }

  return 'id' in channel && typeof channel.id === 'string' && 'send' in channel && typeof channel.send === 'function';
}

export const raidCommand: CommandModule = {
  name: 'raid',
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Server cooperative raid')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start raid')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Public progress channel').setRequired(false))
        .addIntegerOption((opt) => opt.setName('goal').setDescription('Goal points').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('quests').setDescription('Show today quests'))
    .addSubcommand((sub) => sub.setName('progress').setDescription('Show raid progress')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureRaidEnabled();
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Raid is disabled.');
      return;
    }

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const selectedChannel = interaction.options.getChannel('channel', false);
      const channelId = selectedChannel?.id ?? settings?.raidChannelId ?? null;
      if (!channelId) {
        await interaction.editReply('Raid public channel is not configured. Use `/setup set-channels raid:<channel>`.');
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || !canSend(channel)) {
        await interaction.editReply('Raid channel must be a text channel.');
        return;
      }

      const goal = interaction.options.getInteger('goal', false) ?? undefined;
      const result = await startRaid({
        guildId: interaction.guildId,
        publicChannelId: channel.id,
        goalPoints: goal,
        createProgressMessage: async (content) => {
          const sent = await sendComponentsV2Message(interaction.client, channel.id, {
            components: [
              uiCard({
                title: 'Cooperative Raid Progress',
                status: 'initializing',
                accentColor: 0x1e6f9f,
                components: [textBlock(content)]
              })
            ]
          });
          return sent.id;
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'start',
        correlationId,
      });

      await interaction.editReply(
        result.created
          ? `Raid started in <#${result.raid.publicChannelId}>.`
          : `Active raid already exists in <#${result.raid.publicChannelId}>.`,
      );
      return;
    }

    if (sub === 'quests') {
      const data = await getTodayRaidOffers(interaction.guildId);
      if (data.offers.length === 0) {
        await interaction.editReply('No raid offers found for today.');
        return;
      }

      const lines = data.offers.map(
        (offer, idx) => `${idx + 1}. **${offer.key}** - ${offer.points} pts\n${offer.text}`,
      );

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'quests',
        correlationId
      });

      await interaction.editReply({
        content: `Today offers (\`${data.dayDate}\`):\n\n${lines.join('\n\n')}`,
        components: data.offers.map((offer) => buildRaidClaimButton(offer.key)) as never
      });
      return;
    }

    if (sub === 'progress') {
      const snapshot = await getRaidProgressSnapshot({ guildId: interaction.guildId });
      if (!snapshot) {
        await interaction.editReply('No active raid found.');
        return;
      }

      logInteraction({
        interaction,
        feature: 'raid',
        action: 'progress',
        correlationId
      });

      await interaction.editReply(renderRaidProgressText(snapshot));
      return;
    }

    await interaction.editReply('Unknown raid subcommand.');
  }
};

```

## src/discord/commands/duel.ts
```ts
import { SlashCommandBuilder, type GuildBasedChannel, type MessageCreateOptions } from 'discord.js';
import {
  duelEndUsecase,
  duelRoundStartUsecase,
  duelStartUsecase
} from '../../app/usecases/duelUsecases';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import { buildDuelSubmitButton } from '../interactions/components';
import { sendComponentsV2Message, textBlock, uiCard } from '../ui-v2';
import type { CommandModule } from './types';

function canSend(channel: GuildBasedChannel): channel is GuildBasedChannel & {
  send: (options: string | MessageCreateOptions) => Promise<{ id: string }>;
} {
  return 'send' in channel && typeof channel.send === 'function';
}

export const duelCommand: CommandModule = {
  name: 'duel',
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Manage duel rounds and scoreboard')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a new duel')
        .addChannelOption((opt) =>
          opt.setName('public_channel').setDescription('Scoreboard channel').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('round')
        .setDescription('Round controls')
        .addSubcommand((sub) =>
          sub
            .setName('start')
            .setDescription('Start a round and notify all pairs')
            .addIntegerOption((opt) =>
              opt
                .setName('duration_minutes')
                .setDescription('Round duration in minutes')
                .setMinValue(5)
                .setMaxValue(720)
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('end').setDescription('End active duel')),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ ephemeral: true });

    const correlationId = createCorrelationId();
    const settings = await getGuildSettings(interaction.guildId);
    assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    if (!subcommandGroup && subcommand === 'start') {
      const publicChannel = interaction.options.getChannel('public_channel', true);
      if (!publicChannel.isTextBased() || !canSend(publicChannel)) {
        await interaction.editReply('Public channel must be text based.');
        return;
      }

      const result = await duelStartUsecase({
        guildId: interaction.guildId,
        publicChannelId: publicChannel.id,
        createScoreboardMessage: async (content) => {
          const sent = await sendComponentsV2Message(interaction.client, publicChannel.id, {
            components: [
              uiCard({
                title: 'Butler Duel Scoreboard',
                status: 'initializing',
                accentColor: 0xc44536,
                components: [textBlock(content)]
              })
            ]
          });
          return sent.id;
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'start',
        correlationId,
        jobId: null
      });

      const text = result.created
        ? `Duel started in <#${result.duel.publicChannelId}>.`
        : `Duel is already active in <#${result.duel.publicChannelId}>.`;

      await interaction.editReply(text);
      return;
    }

    if (subcommandGroup === 'round' && subcommand === 'start') {
      const durationMinutes = interaction.options.getInteger('duration_minutes', true);

      const result = await duelRoundStartUsecase({
        guildId: interaction.guildId,
        durationMinutes,
        notifyPair: async ({ pairId, privateChannelId, duelId, roundId, roundNo, endsAt }) => {
          const channel = await interaction.client.channels.fetch(privateChannelId);
          if (!channel?.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
            return;
          }

          await channel.send({
            content:
              `Round #${roundNo} is live. Submit before <t:${Math.floor(endsAt.getTime() / 1000)}:t>. ` +
              'Use the button below once per round.',
            components: [buildDuelSubmitButton({ duelId, roundId, pairId }) as never]
          });
        },
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'round_start',
        correlationId,
        jobId: null
      });

      await interaction.editReply(
        `Round #${result.round.roundNo} started for ${result.pairCount} pair(s). Ends <t:${Math.floor(
          result.round.endsAt.getTime() / 1000,
        )}:R>.`,
      );
      return;
    }

    if (!subcommandGroup && subcommand === 'end') {
      const duel = await duelEndUsecase({
        guildId: interaction.guildId,
        boss: ctx.boss,
        correlationId,
        interactionId: interaction.id,
        userId: interaction.user.id
      });

      logInteraction({
        interaction,
        feature: 'duel',
        action: 'end',
        correlationId,
        jobId: null
      });

      await interaction.editReply(`Ended duel in <#${duel.publicChannelId}>.`);
      return;
    }

    await interaction.editReply('Unknown duel subcommand.');
  }
};

```

## src/discord/interactions/components.ts
```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { encodeCustomId } from './customId';

export function buildDuelSubmitButton(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'open_submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Submit answer').setStyle(ButtonStyle.Primary),
  );
}

export function buildDuelSubmissionModal(params: { duelId: string; roundId: string; pairId: string }) {
  const customId = encodeCustomId({
    feature: 'duel',
    action: 'submit_modal',
    payload: {
      duelId: params.duelId,
      roundId: params.roundId,
      pairId: params.pairId
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Round submission');

  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel('Your round answer')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(400)
    .setRequired(true)
    .setPlaceholder('Write your submission here...');

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
  return modal;
}

export function buildOracleClaimModal(guildId: string, weekStartDate: string) {
  const customId = encodeCustomId({
    feature: 'oracle',
    action: 'claim_submit',
    payload: {
      g: guildId,
      w: weekStartDate
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Your weekly oracle');

  const modeInput = new TextInputBuilder()
    .setCustomId('mode')
    .setLabel('Mode: soft / neutral / hard')
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(16)
    .setRequired(true)
    .setPlaceholder('soft');

  const contextInput = new TextInputBuilder()
    .setCustomId('context')
    .setLabel('Context: conflict/ok/boredom/distance/fatigue/jealousy')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(24)
    .setRequired(true)
    .setPlaceholder('ok');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(modeInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contextInput),
  );

  return modal;
}

export function buildCheckinAgreementSelect(options: Array<{ key: string; text: string }>) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'agreement_select',
    payload: {}
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select this week agreement')
    .addOptions(
      options.map((item) => ({
        label: item.text.slice(0, 100),
        description: item.key,
        value: item.key
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildCheckinSubmitModal(agreementKey: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'submit_modal',
    payload: {
      a: agreementKey
    }
  });

  const modal = new ModalBuilder().setCustomId(customId).setTitle('Weekly check-in');

  const fields = [
    { id: 's1', label: 'Communication quality (1-10)' },
    { id: 's2', label: 'Emotional support (1-10)' },
    { id: 's3', label: 'Shared time quality (1-10)' },
    { id: 's4', label: 'Conflict repair (1-10)' },
    { id: 's5', label: 'Overall week (1-10)' }
  ] as const;

  for (const field of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2)
          .setPlaceholder('8'),
      ),
    );
  }

  return modal;
}

export function buildCheckinShareButton(checkinId: string) {
  const customId = encodeCustomId({
    feature: 'checkin',
    action: 'share_agreement',
    payload: {
      c: checkinId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Share agreement publicly')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildAnonModerationButtons(questionId: string) {
  const approveId = encodeCustomId({
    feature: 'anon',
    action: 'approve',
    payload: {
      q: questionId
    }
  });

  const rejectId = encodeCustomId({
    feature: 'anon',
    action: 'reject',
    payload: {
      q: questionId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approveId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(rejectId).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}

export function buildRaidClaimButton(questKey: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'claim',
    payload: {
      q: questKey
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Claim').setStyle(ButtonStyle.Primary),
  );
}

export function buildRaidConfirmButton(claimId: string) {
  const customId = encodeCustomId({
    feature: 'raid',
    action: 'confirm',
    payload: {
      c: claimId
    }
  });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('Partner confirm').setStyle(ButtonStyle.Success),
  );
}

```

## tests/domain/scoreboard.test.ts
```ts
import { describe, expect, it } from 'vitest';
import { renderDuelScoreboard } from '../../src/discord/projections/scoreboardRenderer';

describe('scoreboard renderer', () => {
  it('renders deterministic duel scoreboard', () => {
    const result = renderDuelScoreboard({
      duelId: 'duel_1',
      guildId: 'guild_1',
      status: 'active',
      publicChannelId: 'chan_1',
      scoreboardMessageId: 'msg_1',
      roundNo: 2,
      roundStatus: 'active',
      roundEndsAt: new Date('2025-01-08T10:30:00Z'),
      topPairs: [
        {
          pairId: 'pair_1',
          user1Id: 'u1',
          user2Id: 'u2',
          points: 24,
          submissions: 3
        }
      ],
      totalPairs: 1,
      totalSubmissions: 3,
      updatedAt: new Date('2025-01-08T10:00:00Z')
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('Butler Duel Scoreboard');
    expect(serialized).toContain('Round #2');
    expect(serialized).toContain('<@u1> + <@u2>');
    expect(serialized).toContain('Submissions: **3**');
  });
});

```

## package.json
```json
{
  "name": "together-discord-bot",
  "version": "0.1.0",
  "private": true,
  "description": "Interactions-first Discord bot for relationship server loops",
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "pnpm@10.4.1",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier -w .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "seed": "tsx scripts/seed.ts",
    "discord:deploy-commands": "tsx scripts/deploy-commands.ts"
  },
  "dependencies": {
    "@discordjs/rest": "2.4.3",
    "@sentry/node": "8.35.0",
    "discord.js": "14.16.3",
    "dotenv": "16.4.5",
    "drizzle-orm": "0.36.4",
    "fastify": "4.28.1",
    "pg": "8.13.1",
    "pg-boss": "10.1.5",
    "pino": "9.4.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "22.10.1",
    "@types/pg": "8.11.10",
    "@typescript-eslint/eslint-plugin": "8.15.0",
    "@typescript-eslint/parser": "8.15.0",
    "drizzle-kit": "0.29.1",
    "eslint": "8.57.1",
    "eslint-config-prettier": "9.1.0",
    "prettier": "3.3.3",
    "tsx": "4.19.2",
    "typescript": "5.6.3",
    "vitest": "2.1.5"
  }
}

```


