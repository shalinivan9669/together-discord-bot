# Components V2: Стандарты и практики

Этот проект использует raw Discord API Components V2 через `src/discord/ui-v2/*`.

## Базовые принципы

- Один логический surface = один `Container` card.
- Публичные циклы (duel/raid/hall/horoscope) живут как single-message projection (edit-only).
- Любая интеракция должна подтверждаться <= 3 сек (`deferReply`, `deferUpdate`, `showModal`).
- Длинные тексты разбиваются на короткие `TextDisplay` блоки.

## Каноничные helpers

- `uiCard(...)` - единая карточка с title/status/accent.
- `textBlock(...)` - safe text guard (ограничение длины).
- `separator()` - отделение плотных секций.
- `actionRowButtons(...)` - до 5 кнопок.
- `actionRowSelects(...)` - один select на ряд.
- `sendComponentsV2Message(...)` / `editComponentsV2Message(...)` - отправка/редактирование V2.

## Жесткие ограничения

- Если есть `MessageFlags.IsComponentsV2`, нельзя смешивать legacy поля (`content`, `embeds`, `attachments`, ...).
- Нельзя обходить `ThrottledMessageEditor` для projection refresh.
- Нельзя делать спам-постинг вместо edit одной проекции.

## Ключевые UI-поверхности

### 1. Setup Wizard (persistent panel)

- Рендер: `src/discord/setupWizard/view.ts`
- Действия: `pick_*`, `complete`, `reset`, `test_post`
- Особенности:
  - Draft на пользователя хранится in-memory с TTL.
  - Commit валидирует типы каналов, timezone и existence role.
  - После commit автовключаются безопасные feature/schedule при выполненных требованиях.

### 2. Duel Scoreboard

- Рендер: `src/discord/projections/scoreboardRenderer.ts`
- CTA: `rules`, `how`, `open_room`
- Source of truth: snapshot из DB, не содержимое Discord-сообщения.

### 3. Raid Progress

- Рендер: `src/discord/projections/raidProgressRenderer.ts`
- CTA: `take_quests`, `my_contribution`, `rules`
- Обновление: queue refresh + throttled edit.

### 4. Pair Home Panel

- Рендер: `src/discord/projections/pairHomeRenderer.ts`
- CTA: `checkin`, `raid`, `duel submit/info`
- В комнате пары должен быть ровно один bot-owned panel message.

### 5. Weekly Horoscope Card

- Рендер: `src/discord/projections/horoscopeWeeklyRenderer.ts`
- CTA: `claim_open`, `about`, `start_pair_ritual`

### 6. Monthly Hall Card

- Рендер: `src/discord/projections/monthlyHallRenderer.ts`
- Показывает только opt-in участников.

### 7. Date Generator Results

- Рендер: `src/discord/projections/dateIdeasRenderer.ts`
- Три карточки идей + кнопка `save_weekend`.

## Custom ID контракт

- Кодирование: `encodeCustomId({ feature, action, payload })`
- Декодирование и роутинг: `src/discord/interactions/router.ts`
- Валидация payload/action: через `zod` схемы или строгое ручное парсинг-ветвление.

Рекомендация по payload:
- Минимальный объем (только нужные ключи).
- Никаких невалидированных свободных текстов в custom_id.
- UUID/id/shallow enums вместо длинных строк.

## Паттерн ACK -> Work -> Reply

1. Сразу ACK (`defer*`/`showModal`)
2. Выполнить DB/queue операции
3. Ответить `editReply`/`followUp`
4. Для публичных поверхностей - запросить projection refresh, а не писать напрямую новый пост

## Антипаттерны

- Новое публичное сообщение на каждый state-change.
- Бизнес-решение на основе текста текущего Discord-сообщения.
- Игнор retry/duplicate path (double-click, network retry).
- Встраивание user raw input в V2 payload без ограничений длины/формата.

## Definition of Done для новой UI-фичи

- Есть deterministic renderer.
- Есть явная схема custom id действий.
- Есть защита от дублей (db unique/op_dedup/tx).
- Есть smoke-кейс и негативные кейсы (не тот канал/нет прав/expired session).
- Есть telemetry-поля в structured logs.
