# Команды и Поведение (Полный справочник)

Источник истины: `src/discord/commandDefinitions.ts` и `src/discord/commands/*`.

## Общие правила

- Все команды работают только в guild-контексте.
- Большинство команд отвечают ephemeral-сообщениями.
- Для админских сценариев требуется `Administrator` или настроенная moderator role (в зависимости от команды).
- Часть фич может быть отключена feature-toggle и/или считаться "не сконфигурированной".

## `/ping`

- Цель: простая проверка доступности бота.
- Доступ: любой пользователь.
- Поведение: defer ephemeral -> `pong/ok` локализованный ответ.

## `/setup start`

- Цель: конфигурация guild-среды через setup wizard.
- Доступ: только админ.
- Поведение:
  - Бот публикует persistent Components V2 setup-панель в текущем канале.
  - Владелец панели выбирает category/channels/mod role/timezone.
  - `Complete` применяет конфиг в БД, автоматически включает безопасные фичи и соответствующие расписания.
  - `Reset` откатывает draft к текущему сохраненному конфигу.
  - `Test post` публикует тестовый пост через `public.post.publish` с idempotency.

## `/admin`

### `/admin status`
- Краткий статус конфигурации, фич, расписаний, прав.

### `/admin doctor`
- Диагностика: обязательные настройки, Discord-права, consistency между конфигом/фичами/schedule.

### `/admin feature set <name> <on|off>`
### `/admin feature enable-all`
### `/admin feature disable-all`
- Управление guild feature-map: `horoscope`, `anon`, `raid`, `checkin`, `hall`, `public_post`.

### `/admin config set locale <ru|en>`
### `/admin config get locale`
- Управление локалью гильдии.

### `/admin schedule <name> <on|off>`
- Управление recurring schedule в `scheduler_settings`.

## `/pair`

### `/pair create user:@User`
- Цель: создать/вернуть приватную комнату пары.
- Доступ: админ или configured moderator role.
- Эффекты:
  - Создание пары в БД (или возврат existing).
  - Создание приватного текстового канала внутри pair category.
  - Триггер `pair.home.refresh`.

### `/pair room`
- Цель: выдать ссылку на свою pair room.
- Доступ: участник пары.

## `/duel`

### `/duel start public_channel:#channel`
- Доступ: админ/мод.
- Эффект: старт дуэли и создание публичного scoreboard-сообщения (Components V2).

### `/duel round start duration_minutes:<5..720>`
- Доступ: админ/мод.
- Эффект:
  - Старт раунда.
  - Рассылка в pair rooms кнопки submit (modal input).
  - Планирование `duel.round.close`.

### `/duel end`
- Доступ: админ/мод.
- Эффект: завершение активной дуэли и refresh проекции.

## `/raid`

### `/raid start [channel] [goal]`
- Доступ: админ/мод.
- Эффект: старт рейда и создание публичной progress-карточки.

### `/raid quests`
- Показывает daily deterministic квесты, дает claim-кнопки.

### `/raid progress`
- Краткий текстовый статус активного рейда.

Дополнительно через кнопки:
- claim квеста -> запрос подтверждения партнеру в pair room
- partner confirm -> начисление очков и refresh проекций

## `/horoscope`

### `/horoscope status`
- Проверка включенности фичи, текущей недели, configured канала.

### `/horoscope publish-now`
- Доступ: админ/мод.
- Эффект: enqueue `weekly.horoscope.publish`.

Публичная карточка включает:
- `Get privately` (mode/context picker)
- `About`
- `Start pair ritual`

## `/checkin start`

- Цель: weekly check-in в pair room.
- Доступ: участник пары в корректном pair channel.
- Поток:
  - Select agreement.
  - Modal на 5 оценок.
  - Запись check-in с weekly dedupe.
  - Опционально кнопка `Share publicly`.

## `/anon`

### `/anon ask`
- Открывает modal для анонимного вопроса.
- Защищено rate-limit + dedupe ключом на пользователя/день/текст.

### `/anon queue`
- Доступ: админ/мод.
- Пагинируемая moderation-очередь с approve/reject.
- При approve формируется scheduled post и запускается публикация.

## `/hall`

### `/hall status`
- Статус opt-in по категориям monthly hall.

### `/hall optin category:<all|checkin|raid|duel>`
### `/hall optout category:<all|checkin|raid|duel>`
- Управление приватностью участия в monthly top.

## `/say`

- Цель: медиатор-переформулировка сообщения.
- Поток:
  - Modal с исходным текстом.
  - Детеминированные варианты тональности: `soft | direct | short`.
  - Кнопка `Send to pair room` (one-time idempotent send lock на сессию).

## `/repair`

- Цель: guided 7-minute flow восстановления в pair room.
- Доступ: участник пары в pair room.
- Поведение:
  - Создается одна room-message.
  - Дальше она редактируется на шагах `+2`, `+4`, `+6` минут через `mediator.repair.tick`.

## `/date`

- Цель: сгенерировать deterministic идеи свиданий.
- Поток:
  - Выбор `energy/budget/time` через selects.
  - `Generate 3 ideas` -> три V2-карточки.
  - `Save for weekend` -> запись в `date_weekend_plans` (dedupe-safe).

## `/season status`

- Текущее состояние: базовый статус сезона.
- Если feature `seasons` отключен - сообщает, что функция недоступна.
- Если включен - сейчас возвращает "enabled but not configured" (placeholder до полноценного сезона).

## `/say`, `/repair`, `/date`, `/season` в процессе эксплуатации

Это рабочие команды, но в релизной верификации их нужно включать отдельным блоком smoke, чтобы не оставлять «слепых зон» качества.
