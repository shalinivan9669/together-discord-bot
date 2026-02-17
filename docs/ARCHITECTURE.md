# Архитектура

## Слои

1. `src/discord/*`
- Адаптер Discord: slash-команды, кнопки, select, modal, роутинг интеракций, рендер проекций.

2. `src/app/*`
- Usecase и сервисный слой: orchestration, бизнес-правила, запросы на обновление проекций.

3. `src/domain/*`
- Чистая доменная логика (без `discord.js`), типы, алгоритмы, deterministic-правила.

4. `src/infra/*`
- Доступ к Postgres, Drizzle schema/queries, pg-boss очередь, sentry, инфраструктурный слой.

## Модель процесса

Один процесс запускает одновременно:

- Discord gateway client
- pg-boss worker/scheduler
- Fastify HTTP сервер (`/healthz`)

Это снижает стоимость и упрощает эксплуатацию (Railway-friendly deployment model).

## Runtime boot sequence

1. Валидация env (`src/config/env.ts`)
2. Инициализация Sentry (optional)
3. Запуск pg-boss, регистрация jobs и schedule
4. Логин Discord-клиента
5. Старт HTTP health endpoint
6. Регистрация graceful shutdown обработчиков

## Поток интеракций

- Только interactions-first подход.
- Входы: slash, button, select, modal.
- Message content не читается и не используется как вход.
- Все операции логируются структурированно (`guild_id`, `user_id`, `pair_id`, `correlation_id`, `interaction_id`, `feature`, `job_id`).

## Проекционная модель

Публичные поверхности работают как edit-only одного сообщения:

- Duel scoreboard
- Raid progress
- Pair home panel
- Weekly horoscope card
- Monthly hall card

Обновления идут через queue jobs с coalescing по singleton ключам. Для rate-limit устойчивости используется `ThrottledMessageEditor`.

## Модель надежности и идемпотентности

- Primary dedupe: БД-ограничения уникальности.
- Multi-write операции: транзакции.
- Race-sensitive точки: advisory locks (`duel.round.start`, `duel.round.close`, weekly starts).
- Повторные кнопки/модалки: deterministic dedupe keys в `op_dedup`.

## Components V2 стратегия

- UI строится через `src/discord/ui-v2/*`.
- Создание/редактирование V2-сообщений делается только с `MessageFlags.IsComponentsV2`.
- Legacy поля (`content`, `embeds`, ...) не смешиваются с V2 payload.

## Почему это масштабируется

- Бизнес-состояние в Postgres, а не в сообщениях Discord.
- Очередь decouple-ит пользовательский вход и тяжелые апдейты.
- Повторные события (double-click, retries) приводят к same state.
- Multi-guild конфигурация хранится в DB и переключается без redeploy.
