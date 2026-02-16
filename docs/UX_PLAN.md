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
- Weekly horoscope public post now renders as V2 container with:
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
  - Channel Selects: duel/horoscope/questions/raid
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
