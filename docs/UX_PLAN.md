# UX Plan (Steps 1-3)

## Scope
- This document tracks phased UX implementation for the Discord bot interface model.
- Step 1 and Step 2 are implemented in this repo.
- Step 3 remains a planning track.

## UX Rules (Global)

### Public Dashboards
- Every dashboard is one persistent public message per loop context.
- Never post duplicates for normal state changes.
- All updates must flow through the throttled message editor and queue jobs.
- Public interactions should answer with ephemeral helper replies where possible.
- Oracle dashboard uses deterministic weekly UTC periods and updates the same message only.

### Pair Home Panel
- Each pair room has exactly one bot-owned panel message.
- The message is edited in place on state changes.
- Pinning is best-effort and attempted once only.
- Primary action row remains compact; contextual helper CTA rows may appear when loops are active.

### Ephemeral Wizards
- Setup and admin workflows are ephemeral by default.
- Interactions must acknowledge quickly (`defer*` or `showModal` within 3s).
- Save actions write to durable storage and refresh projections.

## Step 1 (Implemented)

### Components V2 Foundation
- Added `src/discord/ui-v2/` helper kit:
  - `uiCard`, `textBlock`, `section`, `separator`
  - `actionRowButtons`, `actionRowSelects`
  - text truncation guard for text display content
- Added V2 create/edit payload helpers with `IsComponentsV2` flag.

### Public Dashboards Converted to V2
- Duel scoreboard: title/status, round state, top-5, submissions, updated timestamp.
- Raid progress: goal/progress/percent, phase label, participants, top-5.
- Oracle post (weekly cycle): header/teaser + CTA buttons.

### Pair Home Panel + Setup Wizard
- Added pair panel lifecycle fields:
  - `pairs.pair_home_message_id`
  - `pairs.pair_home_pinned_at`
  - `pairs.pair_home_pin_attempted_at`
- Added `pair.home.refresh` debounced projection path.
- Added `/setup` ephemeral wizard (channel selects, moderator role, save/reset/test post).

## Step 2 (Implemented)

### Mediator Activities
- Added `/say`:
  - modal input
  - deterministic soft/direct/short variants
  - ephemeral tone buttons
  - optional `Send to pair room` with idempotent one-time send lock per session
- Added `/repair`:
  - 7-minute guided flow in pair room
  - exactly one room message edited every 2 minutes
  - delayed ticks scheduled via `pg-boss` (`mediator.repair.tick`)

### Date Generator
- Added `/date` filter picker:
  - `energy`
  - `budget`
  - `time`
- `Generate 3 ideas` returns 3 Components V2 cards:
  - each card includes `steps 1-2-3`, `starter phrase`, `plan B`
- `Save for weekend` persists deterministic plan snapshot in `date_weekend_plans`.

### Anonymous QoTD UX
- Published anon questions now include buttons:
  - `Mascot answer`
  - `Propose question`
- `Mascot answer` is deterministic template output (no runtime LLM generation).
- `Propose question` opens the same modal path as `/anon ask`.
- Added explicit rate limiting and idempotency for anon propose/mascot interaction paths.

### Public Card CTA Upgrade
- Duel board CTA set:
  - Rules
  - How
  - Open my room
  - My contribution
- Raid board CTA set:
  - Rules
  - How
  - Open my room
  - My contribution
  - plus dedicated `Take today quests`

### Pair Home Contextual CTAs
- Pair panel keeps primary row for core actions.
- Contextual helper CTA row appears when duel/raid are active, routing to rules/how/contribution actions.

## Step 3 (Plan)

### UX Goals
- Build richer loop continuity without adding channel spam.
- Improve seasonal and rewards discoverability from existing surfaces.

### Planned Work
- Add progressive unlock indicators in pair panel/public dashboard copy.
- Add season-aware CTA routing (without introducing extra public posts).
- Add admin diagnostics panel for configured channels and projection health.
- Add UX snapshots/tests for core message payloads.

### Hard Constraints
- No Message Content intent.
- No arbitrary message reads.
- Continue idempotency-first writes with DB constraints, transactions, and locks where needed.

