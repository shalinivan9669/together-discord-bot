# Content System

Production loops are deterministic and template-driven. Runtime LLM generation is not used.

## Sources
- Oracle templates: `content_oracle_archetypes`
- Weekly agreements: `agreements_library`
- Raid quests: `raid_quests`
- Date generator templates: `src/domain/date/index.ts`
- Mediator `/say` templates: `src/app/services/mediatorService.ts`
- QoTD mascot answer templates: `src/app/services/anonService.ts`

## Oracle structure
Each archetype contains:
- `key`
- `title`
- `variants_json`

`variants_json` shape:
- mode: `soft | neutral | hard`
- context: `conflict | ok | boredom | distance | fatigue | jealousy`
- leaf fields:
  - `risk`
  - `step`
  - `keyPhrase`
  - `taboo`
  - `miniChallenge`

Claim flow:
1. Determine week key by deterministic UTC week start (`week_start_date`).
2. Deterministically choose archetype for `(guild_id, week_start_date)`.
3. User picks mode/context via interaction modal.
4. First claim per `(guild_id, week_start_date, user_id)` is persisted in `oracle_claims`.
5. Re-claims reuse stored claim text (idempotent output for the same week).

Public behavior:
- One public Oracle message per guild (edit-only, no spam reposts).
- One archetype is shared by the whole guild for a week.
- Each user can claim exactly one Oracle hint per week.

## Check-in structure
- Agreement choices come from `agreements_library`.
- Weekly submission writes one row in `checkins`.
- Dedupe rule: `UNIQUE(pair_id, week_start_date)`.
- Optional public share creates `scheduled_posts` entry with agreement text only.

## Mediator structure
- `/say` variants are deterministic template rewrites (`soft | direct | short`) from user modal input.
- Session state is stored in `mediator_say_sessions` for button-driven tone switches and idempotent send-to-room behavior.
- `/repair` uses deterministic step scripts and one-message edits only; state is stored in `mediator_repair_sessions`.

## Date generator structure
- Picker dimensions: `energy`, `budget`, `time`.
- Card generation is deterministic from code templates in `src/domain/date/index.ts`.
- `Save for weekend` writes one deduped profile record per user/weekend in `date_weekend_plans`.

## Anonymous QoTD mascot answers
- Published question button replies use deterministic short template sets.
- Template bucket selection is rule-based from question text and stable hash selection.
- Interaction-level dedupe and daily rate limits prevent spam clicks.

## Raid structure
- Daily offers are persisted in `raid_daily_offers`.
- Claim dedupe rule: `UNIQUE(raid_id, day_date, pair_id, quest_key)`.
- Pair cap enforcement uses `raid_pair_daily_totals`.
- Public progress is always one persistent message edited via projection pipeline.

Deterministic daily offers:
1. Start from all active quest keys.
2. Sort by hash of `(raid_id, day_date, quest_key)`.
3. Take first `RAID_DAILY_OFFERS_COUNT` keys.
4. Persist once per `(raid_id, day_date)`.

## Seed behavior
`scripts/seed.ts` is idempotent and safe to rerun:
- 12 Oracle archetypes
- 10 agreements
- 20 raid quests

Upserts are used so content edits are applied without duplicate rows.


