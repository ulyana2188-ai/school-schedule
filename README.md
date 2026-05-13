# Расписание Интеллект-плюс

Веб-приложение для трёх отделений: расписание, замены с автоподбором, уведомления, аккаунты завучей и учителей.

## Стек

- Node.js + Express
- PostgreSQL
- JWT-авторизация, bcrypt-хеширование паролей
- Чистый HTML/CSS/JS на фронте (без сборки)

## Быстрый деплой на Render (бесплатный план)

1. **Создайте GitHub-репозиторий** и залейте в него всю папку `school-schedule`:
   ```bash
   cd school-schedule
   git init
   git add .
   git commit -m "init"
   gh repo create intellekt-plus-schedule --public --source=. --push
   ```
   (Или загрузите через веб-интерфейс GitHub.)

2. **Зарегистрируйтесь на render.com** (можно через GitHub-аккаунт). Бесплатно.

3. **Подключите репозиторий**:
   - В дашборде Render: New + → **Blueprint**.
   - Выберите ваш GitHub-репозиторий `intellekt-plus-schedule`.
   - Render прочитает файл `render.yaml` и автоматически создаст:
     - PostgreSQL-базу `intellekt-plus-db` (free plan)
     - Web-сервис `intellekt-plus-schedule`
     - Свяжет их через переменные окружения
   - Нажмите **Apply**.

4. **Дождитесь деплоя** (5–7 минут на первый раз). При старте сервер:
   - Применит схему БД (`db/schema.sql`)
   - Запустит `db/seed.js` — создаст 3 завуча и всех учителей из расписания с первичным паролем `12345`

5. **Получите URL**. После деплоя Render даст вам ссылку вида `https://intellekt-plus-schedule-xxxx.onrender.com`. Это и есть ваша ссылка для входа.

6. **Раздайте сотрудникам**: ссылка, email (см. кнопку «Не помню свой email» на экране входа), первичный пароль `12345`. При первом входе каждый меняет пароль.

## Деплой на Railway (альтернатива)

1. Регистрация на railway.app
2. New Project → Deploy from GitHub repo → выбрать репозиторий
3. Add Plugin → PostgreSQL
4. Railway автоматически проставит `DATABASE_URL`. Добавьте вручную:
   - `JWT_SECRET` — длинная случайная строка
5. Settings → Domains → Generate Domain — получите ссылку

## Локальный запуск (для разработки)

```bash
# Установить Postgres локально и создать БД
createdb intellekt_plus

# Установить зависимости
npm install

# .env
cp .env.example .env
# Указать DATABASE_URL=postgresql://localhost:5432/intellekt_plus
# Указать JWT_SECRET=любая_длинная_строка

# Применить схему и засеять данные
npm run migrate
npm run seed

# Запустить
npm start
# → http://localhost:3000
```

## Структура проекта

```
school-schedule/
├── server.js              # Express, все API-эндпойнты
├── package.json
├── render.yaml            # Конфиг для авто-деплоя на Render
├── .env.example
├── db/
│   ├── index.js           # Подключение к Postgres
│   ├── schema.sql         # CREATE TABLE
│   ├── migrate.js         # npm run migrate
│   └── seed.js            # npm run seed — учителя из расписания
├── data/
│   └── schedule.json      # Расписание всех 3 отделений (статические данные)
└── public/
    ├── index.html         # Логин + UI
    ├── style.css
    └── app.js             # API-клиент, рендеринг, логика
```

## API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/login` | `{email, password}` → `{token, user, mustChange}` |
| POST | `/api/auth/change-password` | (auth) `{newPassword}` |
| GET  | `/api/me` | (auth) текущий пользователь |
| GET  | `/api/accounts` | (auth) все аккаунты для UI |
| GET  | `/api/schedule` | (auth) расписание (статика) |
| POST | `/api/replacements` | (auth) создать пачку замен + разослать уведомления |
| GET  | `/api/replacements` | (auth) список замен |
| GET  | `/api/notifications` | (auth) мои уведомления |
| POST | `/api/notifications/:id/read` | (auth) пометить прочитанным |
| POST | `/api/notifications/read-all` | (auth) всё прочитано |
| GET  | `/api/health` | пинг |

## Обновление кода

После любых изменений в коде:
```bash
git add .
git commit -m "что изменили"
git push
```
Render автоматически переразвернёт сервис.

Изменение расписания: замените `data/schedule.json`, закоммитьте, запушьте. После деплоя файл актуализируется.

## Сброс пароля для пользователя (вручную)

Если кто-то забыл новый пароль:
```bash
# Подключиться к БД (Render → Database → Connect → External URL)
psql $DATABASE_URL

# Сбросить пароль на первичный с требованием смены
UPDATE users SET password_hash = '$2a$10$...' /* хеш от 12345 */, must_change = TRUE
WHERE email = 'ivanova.ee@intellekt-plus.ru';
```

Хеш `12345` (для bcrypt): запустите локально `node -e "console.log(require('bcryptjs').hashSync('12345', 10))"`.

## Что дальше

- Импорт реального расписания (Excel → schedule.json) можно автоматизировать
- Добавить роль «директор» с правами на любые отделения
- Email-уведомления (через SendGrid / Resend) — сейчас уведомления только в приложении
- История замен с фильтром по дате/учителю
