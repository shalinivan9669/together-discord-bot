# Together Discord Bot - Документация (RU)

Production-ready Discord-бот для парных активностей, публичных циклов вовлечения и безопасных интерактивных сценариев на базе Components V2.

## Что это за система

Бот работает по модели `Postgres -> очередь/воркеры -> Discord-проекции`:

- PostgreSQL - единственный источник истины.
- Discord - слой отображения и интеракций.
- Публичные поверхности (табло/прогресс/карточки) обновляются через edit одного сообщения.
- Все пользовательские действия идут через slash-команды, кнопки, select и modal.

## Карта документации

- `docs/ARCHITECTURE.md` - архитектура, слои, жизненный цикл процесса.
- `docs/COMMANDS_REFERENCE_RU.md` - полный справочник команд, subcommand, доступов и поведения.
- `docs/COMPONENTS_V2_PATTERNS.md` - стандарты UI и паттерны Components V2.
- `docs/OPERATIONS.md` - эксплуатация, очереди, расписания, runbook.
- `docs/SMOKE_TEST.md` - полный smoke-сценарий после деплоя.
- `docs/DB_SCHEMA.md` - структура БД и ключевые таблицы.
- `docs/AGENT_GUIDE.md` - строгие правила для инженерных/LLM-агентов.

## Быстрый запуск

1. Установить зависимости: `pnpm install --frozen-lockfile`
2. Применить миграции: `pnpm db:migrate`
3. Заполнить seed-данные: `pnpm seed`
4. Задеплоить slash-команды: `pnpm commands:deploy`
5. Запустить сервис: `pnpm start`

После запуска:

1. Выполнить `/setup start`
2. В канале появится persistent setup-панель (Components V2)
3. Заполнить category/channels/role/timezone
4. Завершить конфиг кнопкой `Complete`
5. Проверить `/admin status` и `/admin doctor`

## Ключевые функциональные области

- Пары и приватные комнаты: `/pair create`, `/pair room`, Pair Home panel.
- Дуэли: запуск дуэли, раунды, modal-ответы, scoreboard.
- Рейд: недельный цикл, daily quests, claim + partner confirm, progress card.
- Оракул: один публичный пост (edit-only), период неделя, приватная подсказка через tone/context picker.
  - Один архетип на период для всего сервера.
  - Один пользователь может получить 1 подсказку за период (повтор отдает ту же).
- Чек-ин: weekly agreement + modal на 5 оценок + optional public share.
- Анонимные вопросы: submit, moderation queue, QoTD publish + кнопки.
- Mediator: `/say` (тональности) и `/repair` (7-мин flow с edit одной записи).
- Hall: opt-in/opt-out privacy и monthly hall карточка.
- Date: фильтры energy/budget/time, генерация 3 детерминированных идей, сохранение на выходные.

## Принципы инженерии

- Идемпотентность first: уникальные ограничения, dedupe-ключи, транзакции, advisory locks.
- ACK интеракций <= 3 секунд (`deferReply`, `showModal`, `deferUpdate`).
- Без Message Content intent и без парсинга произвольного текста из чатов.
- Structured logging с `correlation_id`, `interaction_id`, `job_id`.
- Forward-only миграции: уже примененные SQL-файлы не редактируются.

## Язык и локаль

- Базовая локаль продукта - русский.
- Локаль гильдии переключается через `/admin config set locale <ru|en>`.
- Все новые фичи должны иметь user-facing тексты как минимум на `ru`.

