# Agent Pack (RU)

Папка `agent/` содержит прикладные инструкции для инженерных и LLM-агентов.

## Как использовать

1. Выберите релевантный skill по задаче.
2. Применяйте `Do/Don't` как обязательные ограничения.
3. Перед завершением сверяйтесь с чеклистом в skill.

## Набор skills

- `agent/skills/discord-interactions.md` - интеракции, ACK, модалки, компоненты.
- `agent/skills/idempotency.md` - защита от дублей, race и retry.
- `agent/skills/database-migrations.md` - миграции и схема.
- `agent/skills/scoreboard-throttling.md` - edit-only проекции и throttling.
- `agent/skills/raid-loop.md` - рейдовый цикл и ограничения начислений.
- `agent/skills/content-systems.md` - deterministic контентные системы.
- `agent/skills/ops-runbooks.md` - эксплуатация и инциденты.

## Глобальные инварианты

- Postgres - source of truth.
- Discord - projection + interaction слой.
- Public surfaces - single-message edit model.
- Нет Message Content ingestion.
- Все критичные пути idempotent/retry-safe.
