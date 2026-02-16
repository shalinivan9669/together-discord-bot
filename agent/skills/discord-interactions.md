# Discord Interactions Skill

## Do
- ACK within 3 seconds (`deferReply`, `showModal`, `deferUpdate`).
- Use slash commands + buttons + selects + modals.
- Keep user replies ephemeral by default for admin/private flows.

## Don't
- Don't request Message Content intent.
- Don't parse arbitrary chat messages as command inputs.

## Example
- Duel submit button opens modal immediately; modal handler defers and writes to DB.