# Discord Interactions Skill

## Do
- ACK within 3 seconds (`deferReply`, `showModal`, `deferUpdate`).
- Use slash commands + buttons + selects + modals.
- Keep user replies ephemeral by default for admin/private flows.
- Prefer editing one existing message for guided flows (`/repair`) instead of posting step spam.
- Reuse the same modal builder for command and button entry points (`/anon ask` and QoTD propose).

## Don't
- Don't request Message Content intent.
- Don't parse arbitrary chat messages as command inputs.
- Don't fan out multi-message repair or wizard updates when one editable message is enough.

## Example
- Duel submit button opens modal immediately; modal handler defers and writes to DB.
