# Server Setup Checklist

## 1) Invite and intents
- [ ] Invite with scopes: `bot` + `applications.commands`.
- [ ] Bot intents in Discord Developer Portal: enable `Guilds` only.
- [ ] `Message Content` intent is disabled.

Invite URL template:
`https://discord.com/oauth2/authorize?client_id=<DISCORD_APP_ID>&scope=bot%20applications.commands&permissions=241629797440`

## 2) Required bot permissions
- [ ] View Channels
- [ ] Send Messages
- [ ] Read Message History
- [ ] Manage Channels
- [ ] Embed Links
- [ ] Use Application Commands

## 3) Role and channel safety
- [ ] Bot role is above any role restrictions that must not block posting in configured channels.
- [ ] Optional moderator role exists (if you want `/anon queue` and `/pair create` delegation).
- [ ] Moderator role is not higher than server admins.

## 4) Create channels before `/setup`
- [ ] Duel public channel
- [ ] Oracle channel
- [ ] Anonymous questions channel
- [ ] Raid public channel
- [ ] Monthly hall channel

## 5) Run setup wizard
- [ ] Run `/setup` as admin.
- [ ] Pick channels via Channel Select menus (no manual IDs).
- [ ] Pick optional moderator role via Role Select.
- [ ] Press `Save`.
- [ ] Press `Test Post` and confirm a post appears in one configured channel.

## 6) Minimal feature wiring check
- [ ] `/pair create @user` creates private pair room.
- [ ] Pair room has exactly one Pair Home panel message.
- [ ] Public dashboards exist as single editable messages (duel, raid, oracle, monthly hall).
- [ ] `/anon queue` is accessible only to admin/mod role.

## 7) First-run safety
- [ ] If `ALLOWED_GUILD_IDS` is set, confirm this guild ID is included.
- [ ] Verify startup self-check log appears after boot.
- [ ] Verify `/healthz` is green before onboarding users.

