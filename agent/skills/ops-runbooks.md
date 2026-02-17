# Ops Runbooks Skill

## Цель

Сократить MTTR при инцидентах и не ухудшить состояние системы ручными действиями.

## Do

- Всегда начинать с `/healthz`.
- Коррелировать события по `correlation_id`, `interaction_id`, `job_id`.
- Проверять queue depth и retry поведение перед ручным вмешательством.
- Предпочитать graceful restart вместо импровизированных hotfix в проде.
- Для repair-инцидентов смотреть `mediator_repair_sessions`.

## Don't

- Не публиковать вручную посты в projection channels как "временный фикс".
- Не логировать секреты в процессе диагностики.
- Не выполнять destructive команды БД без явной задачи/плана.

## Operational safety checklist

- ACK интеракций соблюдается.
- Message content не используется как вход.
- DB constraints + tx защищают от дублей.
- Public projections edit-only.
- Schedules idempotent.
- Логи трассируются по correlation id.
- Миграции и seed повторяемы.
