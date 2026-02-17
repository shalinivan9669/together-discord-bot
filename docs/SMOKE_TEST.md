# Smoke Test

Run this after deploy, in one test guild, with two human test accounts (`UserA`, `UserB`) and one admin/mod account.

## 0) Runtime smoke
1. `pnpm smoke`
Expected:
- Environment schema prints OK.
- Database connection prints OK.
- pg-boss ping prints OK.
- Schedule list prints runtime `enabled`/`disabled` and DB `present`/`missing`.

2. `GET /healthz`
Expected:
- `ok: true`
- `db: "ok"`
- `discord: "ready"`
- `boss: "ok"`

## 1) Discord command smoke (ordered)
1. `/setup`
Expected:
- Ephemeral Setup Wizard card with Channel Select and Role Select controls.

2. In `/setup` panel, select all required channels and optional moderator role, then press `Save` and `Test Post`.
Expected:
- `Guild settings saved.`
- `Test post queued...` and a post appears in configured channel.

3. `/pair create user:@UserB` (run by admin/mod)
Expected:
- Private pair room created (or reused).
- Exactly one Pair Home panel message appears in the pair room.

4. In pair room, `/pair room` from `UserA` and `UserB`.
Expected:
- Both get the same room reference.

5. `/duel start public_channel:#duel-channel`
Expected:
- Duel scoreboard message exists as one public dashboard message.

6. `/duel round start duration_minutes:10`
Expected:
- Pair room gets duel round notification with submit button.
- Pair Home panel updates and shows `Duel submit` button.

7. `UserA` clicks `Duel submit` from Pair Home and submits modal.
Expected:
- Ephemeral confirmation.
- Scoreboard message edits in place (no new message).

8. `/raid start channel:#raid-channel`
Expected:
- Raid progress dashboard message exists as one public dashboard message.
- Pair Home panel refreshes with raid daily points line.

9. In raid dashboard, click `Take quests`, claim one quest, then partner confirms in pair room.
Expected:
- Confirmation succeeds.
- Raid dashboard edits in place.
- Pair Home panel edits in place with updated raid points.

10. `/horoscope publish-now` (admin/mod)
Expected:
- Weekly horoscope dashboard exists as one message in horoscope channel.
- Re-running command edits same message (no extra post).

11. In weekly horoscope dashboard, click `Get privately`.
Expected:
- Ephemeral picker with Mode + Context selects.
- After submit, delivery message indicates DM or pair-room fallback.

12. `/checkin start` inside pair room.
Expected:
- Agreement select appears.
- Submit modal accepts 5 scores.
- Pair Home panel edits in place to submitted check-in status.

13. `/anon ask` from normal user, then `/anon queue` from admin/mod.
Expected:
- Queue is pageable (`Prev`/`Next`) and admin-only.
- Approve/reject updates queue message cleanly and returns ephemeral moderation feedback.

14. `/hall status`, then `/hall optin category:all`, then `/hall status`.
Expected:
- Opt-in status reflects updates correctly.

## Pass criteria
- No interaction timeout errors.
- No dashboard spam (single-message edit behavior preserved).
- No permission bypass for admin/mod-only flows.
- `/healthz` remains healthy throughout.
