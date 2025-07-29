# Calendar Auth Server

Минимальный OAuth сервер для интеграции Google Calendar с Telegram WebApp.

## Быстрый старт

### 1. Локальная разработка

```bash
cd auth-server
npm install
npm start
```

Сервер будет доступен на http://localhost:3001

### 2. Деплой на Render

1. Создайте новый Web Service на render.com
2. Подключите этот репозиторий
3. Настройки:
   - **Root Directory**: `auth-server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. Добавьте переменные окружения:
   - `GOOGLE_CLIENT_ID` = ваш Client ID
   - `GOOGLE_CLIENT_SECRET` = ваш Client Secret
   - `GOOGLE_REDIRECT_URI` = https://your-app.onrender.com/auth/callback
   - `FRONTEND_URL` = https://your-frontend.netlify.app

### 3. Настройка Google OAuth

В Google Cloud Console добавьте Authorized redirect URI:
```
https://your-app.onrender.com/auth/callback
```

## Endpoints

- `GET /` - Статус сервера
- `GET /auth/google` - Начало OAuth
- `GET /auth/callback` - Callback от Google
- `GET /auth/session?sessionId=xxx` - Получение токена

## Как работает

1. Пользователь нажимает "Sign in" в WebApp
2. Редирект на `/auth/google`
3. Google OAuth
4. Callback на `/auth/callback`
5. Сервер сохраняет токен и создает sessionId
6. Редирект в WebApp с sessionId
7. WebApp получает токен с сервера по sessionId 