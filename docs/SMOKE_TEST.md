# Smoke Test

Запускать после каждого деплоя в тестовой гильдии с минимум тремя аккаунтами:

- `UserA`, `UserB` (обычные участники)
- `Admin` (администратор/модератор)

## 0) Runtime smoke

1. `pnpm smoke`
Ожидается:
- env schema OK
- db connect OK
- pg-boss ping OK
- список schedule с флагами enable/disable

2. `GET /healthz`
Ожидается:
- `ok: true`
- `db: "ok"`
- `discord: "ready"`
- `boss: "ok"`

## 1) Setup и admin

1. `/setup start` (Admin)
Ожидается:
- в текущем канале появляется persistent setup panel (Components V2)
- команда возвращает ссылку на панель

2. На setup panel выбрать category/channels/role/timezone, нажать `Complete`.
Ожидается:
- панель показывает completed статус
- конфиг сохранен

3. Нажать `Test post`.
Ожидается:
- queued/уже queued сообщение
- тестовый пост появляется в целевом канале

4. `/admin status`, `/admin doctor`
Ожидается:
- нет критичных ошибок
- feature/config/schedule диагностируются корректно

## 2) Pair, duel, raid

1. `/pair create user:@UserB` (Admin/Mod)
Ожидается:
- приватная pair room создана/переиспользована
- в комнате есть один Pair Home panel

2. `/pair room` от `UserA` и `UserB`
Ожидается:
- оба получают ссылку на одну и ту же комнату

3. `/duel start public_channel:#duel-channel`
Ожидается:
- создано одно публичное duel scoreboard сообщение

4. `/duel round start duration_minutes:10`
Ожидается:
- в pair room кнопка submit
- Pair Home обновлен

5. `UserA` отправляет ответ через modal.
Ожидается:
- ephemeral подтверждение
- scoreboard редактируется in-place

6. `/raid start channel:#raid-channel`
Ожидается:
- создано одно публичное raid progress сообщение

7. В raid dashboard нажать `Взять квесты` -> claim -> partner confirm.
Ожидается:
- подтверждение проходит
- raid dashboard и pair home обновляются edit-ом

## 3) Horoscope, checkin, anon, hall

1. `/horoscope publish-now` (Admin/Mod)
Ожидается:
- weekly horoscope card существует как одна запись
- повторный publish обновляет/дедупит, не спамит канал

2. В weekly horoscope нажать `Получить в личку`.
Ожидается:
- mode/context picker
- корректная delivery логика

3. `/checkin start` в pair room
Ожидается:
- select agreement
- modal на 5 оценок
- pair home обновлен

4. `/anon ask` от обычного пользователя, затем `/anon queue` от Admin/Mod
Ожидается:
- queue paginated
- approve/reject обновляют очередь и дают ephemeral feedback

5. `/hall status` -> `/hall optin category:all` -> `/hall status`
Ожидается:
- opt-in состояние изменяется корректно

## 4) Mediator и date

1. `/say`
Ожидается:
- открывается modal
- после submit доступны `soft/direct/short`
- `Send to pair room` срабатывает один раз на сессию

2. `/repair` в pair room
Ожидается:
- стартует 7-минутный flow
- в комнате одна bot-message редактируется на шагах `+2/+4/+6`

3. `/date`
Ожидается:
- picker energy/budget/time
- `Generate 3 ideas` отдает 3 карточки
- `Save for weekend` подтверждает сохранение

## 5) Дополнительные команды

1. `/ping`
Ожидается: быстрый ephemeral ответ.

2. `/season status`
Ожидается:
- при выключенной фиче - понятный disabled ответ
- при включенной фиче - current placeholder статус

## Pass criteria

- Нет interaction timeout.
- Нет дублированного публичного спама в проекциях.
- Нет permission bypass в admin/mod потоках.
- Повторные клики не приводят к двойным начислениям/двойным публикациям.
- `/healthz` остается здоровым во время всего smoke.
