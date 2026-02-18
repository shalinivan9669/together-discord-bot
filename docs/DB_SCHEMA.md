# Database Schema

Migrations:
- `src/infra/db/migrations/0000_init.sql`
- `src/infra/db/migrations/0001_phase2_runtime.sql`
- `src/infra/db/migrations/0002_step1_ui_v2.sql`
- `src/infra/db/migrations/0003_step2_activities.sql`
- `src/infra/db/migrations/0004_step3_stability.sql`

## Core
- `guild_settings(guild_id PK, timezone, configured channel ids including oracle_channel_id, hall_channel_id, moderator_role_id, astro_horoscope_channel_id, astro_horoscope_message_id, astro_horoscope_anchor_date, oracle_message_id, timestamps)`
- `users(user_id PK, zodiac_sign NULL, created_at)`
- `pairs(id PK, guild_id, user1_id, user2_id, user_low, user_high, private_channel_id, status, created_at, UNIQUE(guild_id,user_low,user_high))`
- `monthly_hall_cards(id PK, guild_id, month_key, channel_id, message_id, timestamps, UNIQUE(guild_id,month_key))`
- `monthly_hall_opt_ins(guild_id,user_id,category,timestamps, PK composite)`

## Duels (Phase 1)
- `duels(id PK, guild_id, status, public_channel_id, scoreboard_message_id, timestamps)`
- `duel_rounds(id PK, duel_id, round_no, status, started_at, ends_at, closed_at, UNIQUE(duel_id,round_no))`
- `duel_submissions(id PK, round_id, pair_id, payload_json, created_at, UNIQUE(round_id,pair_id))`

## Outbox + Dedupe
- `scheduled_posts(id PK, guild_id, type, target_channel_id, payload_json, scheduled_for, status, idempotency_key UNIQUE, sent_at, published_message_id, last_error, updated_at)`
- `op_dedup(operation_key PK, payload_hash, created_at)`
- `command_rate_limits(guild_id,user_id,action_key,day_date,count,updated_at, PK composite)`

## Mediator + Date Activities (Step 2)
- `mediator_say_sessions(id PK, guild_id, user_id, pair_id, source_text, soft_text, direct_text, short_text, selected_tone, sent_to_pair_at, created_at)`
- `mediator_repair_sessions(id PK, guild_id, pair_id, channel_id, message_id, started_by_user_id, status, current_step, started_at, last_tick_at, completed_at)`
- `date_weekend_plans(id PK, guild_id, user_id, pair_id, weekend_date, energy, budget, time_window, ideas_json, created_at, UNIQUE(guild_id,user_id,weekend_date,energy,budget,time_window))`

## Oracle (Phase 2)
- `content_oracle_archetypes(key PK, title, variants_json, active, created_at)`
- `oracle_weeks(id PK, guild_id, week_start_date, archetype_key, seed, UNIQUE(guild_id,week_start_date))`
- `oracle_claims(id PK, guild_id, week_start_date, user_id, pair_id, delivered_to, mode, context, claim_text, UNIQUE(guild_id,week_start_date,user_id))`

## Astro Horoscope
- `content_astro_archetypes(key PK, title, variants_json, active, created_at)`
- `astro_cycles(id PK, guild_id, cycle_start_date DATE, archetype_key -> content_astro_archetypes.key, seed, UNIQUE(guild_id,cycle_start_date))`
- `astro_claims(id PK, guild_id, cycle_start_date DATE, user_id, pair_id NULL, delivered_to, sign_key, mode, context, claim_text, UNIQUE(guild_id,cycle_start_date,user_id))`

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
- `raid_claims(id PK, raid_id, day_date, pair_id, quest_key, status, base_points, bonus_points, requested_by_user_id, confirmed_by_user_id, UNIQUE(raid_id,day_date,pair_id,quest_key))`
- `raid_pair_daily_totals(raid_id, day_date, pair_id, points_total, UNIQUE(raid_id,day_date,pair_id))`

