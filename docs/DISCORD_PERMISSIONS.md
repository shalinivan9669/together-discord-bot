# Discord Permissions

## Intents
- Required: `Guilds`
- Not used: `MessageContent`
- `GuildMembers` is not requested.

## Bot permissions
Required:
- View Channels
- Send Messages
- Read Message History
- Manage Channels (for pair room creation)
- Embed Links
- Use Application Commands

Optional (off by default):
- Manage Messages
- Manage Roles

## Pair room permissions
Applied at channel creation:
- Deny `@everyone` view
- Allow pair users: view, send, read history
- Allow bot: view, send, read history, manage channel
- Optional moderator role: view + read history only