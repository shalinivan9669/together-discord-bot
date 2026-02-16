# Database Schema

Migration: `src/infra/db/migrations/0000_init.sql`

## Core
- `guild_settings(guild_id PK, timezone, configured channel ids, moderator_role_id, timestamps)`
- `users(user_id PK, created_at)`
- `pairs(id PK, guild_id, user1_id, user2_id, user_low, user_high, private_channel_id, status, created_at, UNIQUE(guild_id,user_low,user_high))`

## Duels (Phase 1)
- `duels(id PK, guild_id, status, public_channel_id, scoreboard_message_id, timestamps)`
- `duel_rounds(id PK, duel_id, round_no, status, started_at, ends_at, closed_at, UNIQUE(duel_id,round_no))`
- `duel_submissions(id PK, round_id, pair_id, payload_json, created_at, UNIQUE(round_id,pair_id))`

## Outbox + Dedupe
- `scheduled_posts(id PK, guild_id, type, target_channel_id, payload_json, scheduled_for, status, idempotency_key UNIQUE, timestamps)`
- `op_dedup(operation_key PK, payload_hash, created_at)`
- `command_rate_limits(guild_id,user_id,action_key,day_date,count,updated_at, PK composite)`

## Horoscope (Phase 2)
- `content_horoscope_archetypes(key PK, title, variants_json, active, created_at)`
- `horoscope_weeks(id PK, guild_id, week_start_date, archetype_key, seed, UNIQUE(guild_id,week_start_date))`
- `horoscope_claims(id PK, guild_id, week_start_date, user_id, pair_id, delivered_to, UNIQUE(guild_id,week_start_date,user_id))`

## Check-in (Phase 2)
- `agreements_library(key PK, text, tags_json, active, created_at)`
- `checkins(id PK, guild_id, pair_id, week_start_date, scores_json, agreement_key, status, UNIQUE(pair_id,week_start_date))`

## Anonymous Questions (Phase 2)
- `anon_questions(id PK, guild_id, author_user_id, question_text, status, published_message_id, moderation fields)`

## Rewards / Progress (Phase 2)
- `rewards_ledger(id PK, guild_id, user_id, pair_id, kind, amount, key, source_type, source_id, UNIQUE(kind,key,source_type,source_id,user_id))`
- `progress_state(guild_id,user_id unique, pair_id, level, unlocks_json, updated_at)`

## Seasons / Capsules (Phase 2)
- `seasons(id PK, guild_id, season_key, start_date, end_date, status, UNIQUE(guild_id,season_key))`
- `weekly_capsules(id PK, guild_id, week_start_date, seed, UNIQUE(guild_id,week_start_date))`

## Raid (Phase 2)
- `raids(id PK, guild_id, status, week_start_date, week_end_at, goal_points, progress_points, public_channel_id, progress_message_id, UNIQUE(guild_id,week_start_date))`
- `raid_quests(id PK, key UNIQUE, category, difficulty, points, text, active)`
- `raid_daily_offers(id PK, raid_id, day_date, quest_keys_json, UNIQUE(raid_id,day_date))`
- `raid_claims(id PK, raid_id, day_date, pair_id, quest_key, status, points, UNIQUE(raid_id,day_date,pair_id,quest_key))`
- `raid_pair_daily_totals(raid_id, day_date, pair_id, points_total, UNIQUE(raid_id,day_date,pair_id))`