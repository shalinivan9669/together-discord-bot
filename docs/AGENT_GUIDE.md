# Agent Guide (RU)

Документ для инженеров и LLM-агентов, которые вносят изменения в проект.

## 0. Цель

Любое изменение должно:

- сохранять production-устойчивость;
- не ломать идемпотентность;
- не создавать Discord-спам;
- оставаться совместимым с Components V2 стратегией.

## 1. Неприкосновенные инварианты

- Postgres - source of truth, Discord - projection слой.
- Без Message Content intent и без парсинга произвольных сообщений.
- Interaction ACK <= 3 секунд.
- Публичные поверхности обновляются edit-ом одной bot-owned записи.
- Все path должны быть retry-safe.

## 2. Обязательный чеклист перед merge

- [ ] Новая логика покрыта позитивным и негативным путями.
- [ ] Используется `deferReply` / `deferUpdate` / `showModal` там, где путь > 3 сек.
- [ ] DB-записи в интерактивных путях защищены от дублей.
- [ ] Для публичных апдейтов используется projection refresh + throttled editor.
- [ ] Логи содержат `correlation_id` и контекст операции.
- [ ] Миграции forward-only, seed-скрипты re-runnable.

## 3. Идемпотентность: правила реализации

1. Сначала уникальные ограничения в БД.
2. Для multi-write - транзакция.
3. Для race points - advisory lock.
4. Для повторных кнопок/модалок - deterministic dedupe key (`op_dedup` или эквивалент).
5. Повторное выполнение должно возвращать корректный "already processed" ответ, а не ошибку.

## 4. Components V2: правила

- UI строить через `src/discord/ui-v2/*`.
- При V2 payload обязательно включать `MessageFlags.IsComponentsV2`.
- Не смешивать V2 с legacy fields.
- Не делать "каждый апдейт = новое сообщение".
- Для projection flows не обходить `ThrottledMessageEditor`.

## 5. Командные и интеракционные изменения

При добавлении новой команды/кнопки/modals/select:

- Добавить/обновить command definition и handler.
- Определить custom id contract (`feature/action/payload`).
- Валидировать payload shape (zod или эквивалент).
- Добавить dedupe/limit защиту.
- Обновить docs:
  - `docs/COMMANDS_REFERENCE_RU.md`
  - `docs/COMPONENTS_V2_PATTERNS.md`
  - `docs/SMOKE_TEST.md`

## 6. Миграции и схема

- Никогда не редактировать уже примененные migration SQL в проде.
- Добавлять только новую migration.
- Схема Drizzle и SQL миграции должны совпадать.
- Для новых таблиц интеракций заранее проектировать:
  - primary/unique ключи,
  - статусные поля для retry и recover,
  - индексы на горячие выборки.

## 7. Операционная безопасность

- Не логировать секреты и чувствительные токены.
- Не делать destructive SQL/скрипты без явной задачи.
- Сначала диагностировать через `/healthz`, `/admin status`, `/admin doctor`, queue depth.
- При инциденте предпочитать graceful restart и idempotent replay.

## 8. Definition of Done для новой фичи

- [ ] Бизнес-логика оформлена в app/domain слоях.
- [ ] Есть полная interaction-цепочка (command -> component/modal -> db -> projection).
- [ ] Нет двойных записей при double-click/retry.
- [ ] Есть smoke-кейс в `docs/SMOKE_TEST.md`.
- [ ] Есть эксплуатационные заметки в `docs/OPERATIONS.md`.
- [ ] UI соответствует Components V2 стандарту.

## 9. Критические анти-паттерны

- Использовать Discord message text как источник истины.
- Игнорировать retries и idempotency.
- Создавать новые публичные сообщения вместо edit текущего projection message.
- Внедрять runtime LLM generation в стабильный production loop, где нужен deterministic output.
- Менять applied migration файлы.
