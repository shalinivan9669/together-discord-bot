# Content System

Production loops are deterministic and template-driven. Runtime LLM generation is not used.

## Sources
- Horoscope templates: `content_horoscope_archetypes`
- Weekly agreements: `agreements_library`
- Raid quests: `raid_quests`

## Horoscope structure
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
1. Determine week key by ISO Monday date (`week_start_date`).
2. Deterministically choose archetype for `(guild_id, week_start_date)`.
3. User picks mode/context via interaction modal.
4. First claim per `(guild_id, week_start_date, user_id)` is persisted in `horoscope_claims`.
5. Re-claims reuse stored claim text (idempotent output for the week).

## Check-in structure
- Agreement choices come from `agreements_library`.
- Weekly submission writes one row in `checkins`.
- Dedupe rule: `UNIQUE(pair_id, week_start_date)`.
- Optional public share creates `scheduled_posts` entry with agreement text only.

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
- 12 horoscope archetypes
- 10 agreements
- 20 raid quests

Upserts are used so content edits are applied without duplicate rows.
