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

## Don’t
- Don’t mix spammy follow-up public posts for normal state updates.
- Don’t bypass `ThrottledMessageEditor` for projection edits.
- Don’t encode unvalidated payloads directly from user input.
- Don’t place long prose into one giant text block.

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

### Weekly horoscope V2 post
```ts
const message = renderWeeklyHoroscopePost({ guildId, weekStartDate });
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
