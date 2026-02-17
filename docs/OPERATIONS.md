# Эксплуатация

## Bootstrap

1. `pnpm install --frozen-lockfile`
2. `pnpm db:migrate`
3. `pnpm seed`
4. `pnpm commands:deploy`
5. `pnpm start`

## Health-check

Endpoint: `GET /healthz`

Ожидаемые поля:

- `ok`
- `version`
- `uptime`
- `db` (`ok` / `fail`)
- `discord` (`ready` / `not_ready`)
- `boss` (`ok` / `fail`)

## Jobs очереди

Зарегистрированные jobs:

- `duel.round.close`
- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `pair.home.refresh`
- `monthly.hall.refresh`
- `mediator.repair.tick`
- `public.post.publish`
- `weekly.horoscope.publish`
- `weekly.checkin.nudge`
- `weekly.raid.start`
- `weekly.raid.end`
- `daily.raid.offers.generate`

Recurring schedule:

- Weekly horoscope: Monday `10:00`
- Weekly check-in nudge: Wednesday `12:00`
- Weekly raid start: Monday `09:00`
- Weekly raid end: Monday `09:05`
- Daily raid offers: daily `09:00`
- Raid projection refresh: every 10 minutes
- Monthly hall refresh: day `1` at `10:00`
- Public post publish sweep: every 2 minutes

## Админ-управление

- `/admin status`
- `/admin doctor`
- `/admin feature set <name> <on|off>`
- `/admin feature enable-all`
- `/admin feature disable-all`
- `/admin config set locale <ru|en>`
- `/admin config get locale`
- `/admin schedule <name> <on|off>`

`/admin doctor` проверяет:

- required setup keys в DB
- корректность Discord permissions
- consistency feature state vs config
- consistency recurring schedule

## Локаль

- По умолчанию пользовательские ответы - `ru`.
- Гильдия переключается через `/admin config set locale`.

## Delayed jobs

- `/repair` создает `mediator.repair.tick` на `+2`, `+4`, `+6` минут.

## Трассировка и логи

Все interaction/job path обязаны логировать:

- `correlation_id`
- `interaction_id`
- `job_id`
- `guild_id`
- `user_id`
- `feature`
- `action`

## Runbook: зависшие jobs

1. Фильтровать логи по `job_id`, `feature`, `action`.
2. Проверить `db/discord/boss` через `/healthz`.
3. Проверить совместимость payload schema после релиза.
4. Проверить глубину очередей pg-boss.
5. Для `public.post.publish` проверить `scheduled_posts.status/last_error/updated_at`.
6. Для `mediator.repair.tick` проверить `mediator_repair_sessions`.
7. При необходимости сделать graceful restart.

## Runbook: проблемы Discord/rate-limit

1. Ожидать автоматический retry/backoff в projection editor.
2. Не делать ручной спам-постинг в projection channels.
3. Проверить токен и gateway readiness.
4. После восстановления убедиться, что очереди дренировались.

## Runbook: backlog проекций

1. `/healthz` должен показывать `boss=ok`, `discord=ready`, `db=ok`.
2. Проверить queue depth:
- `duel.scoreboard.refresh`
- `raid.progress.refresh`
- `pair.home.refresh`
- `monthly.hall.refresh`
3. Проверить singleton keys:
- `projection:duel_scoreboard:<guild>:<duel>`
- `projection:raid_progress:<guild>:<raid|active>`
- `projection:pair_home:<guild>:<pair>`
4. Проверить ошибки `projection.message_editor`.
5. Если backlog не падает - перезапустить worker процесс.

## Runbook: monthly hall

1. Проверить `guild_settings.hall_channel_id`.
2. Проверить запись `monthly_hall_cards` для текущего `month_key`.
3. Если message удалили вручную - очистить `message_id` и дать воркеру пересоздать карточку.
4. Проверить `monthly_hall_opt_ins` (только opt-in попадают в top).

## Runbook: DB outage

1. `/healthz` покажет `db=fail`.
2. Interaction/job пути начнут fail-fast и уйдут в retry, где предусмотрено.
3. Восстановить доступность Postgres.
4. Проверить возобновление записей в `scheduled_posts`, `raid_claims`, `checkins`, `mediator_*`, `date_weekend_plans`.

## Graceful shutdown

На `SIGTERM` / `SIGINT`:

1. Остановка приема новых jobs в pg-boss
2. Закрытие Postgres pool
3. Остановка Discord клиента
4. Остановка HTTP сервера

Реализация: `src/index.ts`.
