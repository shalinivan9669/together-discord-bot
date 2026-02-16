# Content System

No LLM generation in production loops. Content is deterministic and template-driven.

## Horoscope
- Source: `content_horoscope_archetypes`
- Weekly selection: deterministic by `(guild_id, week_start_date, seed)`
- Claim output assembled from archetype variants by mode/context.

## Check-in agreements
- Source: `agreements_library`
- One agreement selected in weekly check-in flow.
- Optional public sharing is agreement text only.

## Raid quests
- Source: `raid_quests`
- Daily offers stored in `raid_daily_offers` for deterministic replay.

## Seeds
`scripts/seed.ts` is idempotent and safe to rerun:
- 12 horoscope archetypes
- 10 agreements
- 20 raid quests