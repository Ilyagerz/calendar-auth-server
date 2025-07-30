import express from 'express';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// В памяти храним сессии (для production используйте Redis)
const SESSIONS = {};

// Переменные окружения
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '727337702991-ksk603d9r3kodi1gpgn9hgtrr3re27pn.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

console.log('🚀 Auth Server starting...');
console.log('📱 Frontend URL:', FRONTEND_URL);
console.log('🔐 Google Client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: '📅 Calendar Auth Server is running!',
    endpoints: {
      '/auth/google': 'Start Google OAuth',
      '/auth/callback': 'Google OAuth callback',
      '/auth/session?sessionId=xxx': 'Get access token by session ID'
    },
    sessions: Object.keys(SESSIONS).length
  });
});

// Начало авторизации Google
app.get('/auth/google', (req, res) => {
  const isTelegramRequest = req.query.telegram === 'true';
  console.log('🔄 Starting Google OAuth...', { telegram: isTelegramRequest });
  
  const state = uuidv4() + (isTelegramRequest ? '_telegram' : '');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('📤 Redirecting to Google:', authUrl.substring(0, 100) + '...');
  
  res.redirect(authUrl);
});

// Callback от Google
app.get('/auth/callback', async (req, res) => {
  const { code, error, state } = req.query;
  
  const isTelegramFlow = state && state.includes('_telegram');
  
  console.log('📥 Google callback received:', { 
    code: code ? 'received' : 'missing', 
    error: error || 'none',
    telegram: isTelegramFlow
  });
  
  if (error) {
    console.error('❌ Google OAuth error:', error);
    return res.redirect(`${FRONTEND_URL}?error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    console.error('❌ Missing authorization code');
    return res.redirect(`${FRONTEND_URL}?error=missing_code`);
  }
  
  try {
    console.log('🔄 Exchanging code for access token...');
    
    // Обмен code на access_token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access_token received: ' + JSON.stringify(tokenData));
    }
    
    console.log('✅ Access token received');
    
    // Получаем информацию о пользователе
    const userResponse = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${tokenData.access_token}`);
    const userData = await userResponse.json();
    
    console.log('✅ User data received:', userData.email);
    
    // Создаем сессию
    const sessionId = uuidv4();
    SESSIONS[sessionId] = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      user: userData,
      expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
      created_at: new Date().toISOString()
    };
    
    console.log('💾 Session created:', sessionId);
    console.log('📊 Active sessions:', Object.keys(SESSIONS).length);
    
    // Используем флаг из state для определения Telegram контекста
    console.log('🔍 Request context:', { telegram: isTelegramFlow });
    
    if (isTelegramFlow) {
      // Для Telegram WebApp делаем редирект через tg:// схему
      const telegramUrl = `tg://resolve?domain=yourcalendarik_bot&startapp=session_${sessionId}`;
      console.log('📱 Redirecting to Telegram:', telegramUrl);
      
      // Показываем страницу с инструкциями и автоматическим редиректом
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorization Complete</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 40px 20px; }
            .container { max-width: 400px; margin: 0 auto; }
            .success { color: #10b981; font-size: 48px; margin-bottom: 20px; }
            .btn { background: #0088cc; color: white; padding: 15px 30px; border: none; border-radius: 8px; 
                   font-size: 16px; text-decoration: none; display: inline-block; margin: 10px; cursor: pointer; }
            .btn:hover { background: #006ba6; }
            .session-id { font-family: monospace; background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅</div>
            <h2>Authorization Successful!</h2>
            <p>Your Google Calendar is now connected.</p>
            <p><strong>Session ID:</strong></p>
            <div class="session-id">${sessionId}</div>
            <p>Return to Telegram to access your calendar.</p>
            <a href="${FRONTEND_URL}?sessionId=${sessionId}" class="btn">📱 Return to Calendar</a>
            <br><br>
            <button onclick="window.close()" class="btn" style="background: #6b7280;">Close Tab</button>
            <script>
              // Попробуем автоматически вернуться в Telegram через 3 секунды
              setTimeout(() => {
                try {
                  window.location.href = '${telegramUrl}';
                } catch(e) {
                  console.log('Telegram redirect failed:', e);
                }
              }, 3000);
            </script>
          </div>
        </body>
        </html>
      `);
    } else {
      // Для обычного браузера - стандартный редирект
      const redirectUrl = `${FRONTEND_URL}?sessionId=${sessionId}`;
      console.log('📤 Redirecting to frontend:', redirectUrl);
      res.redirect(redirectUrl);
    }
    
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    res.redirect(`${FRONTEND_URL}?error=auth_failed&details=${encodeURIComponent(error.message)}`);
  }
});

// Получение access token по sessionId
app.get('/auth/session', (req, res) => {
  const { sessionId } = req.query;
  
  console.log('🔍 Session lookup:', sessionId);
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }
  
  const session = SESSIONS[sessionId];
  
  if (!session) {
    console.log('❌ Session not found:', sessionId);
    return res.status(401).json({ error: 'Session not found' });
  }
  
  if (session.expires_at < Date.now()) {
    console.log('⏰ Session expired:', sessionId);
    delete SESSIONS[sessionId];
    return res.status(401).json({ error: 'Session expired' });
  }
  
  console.log('✅ Session found:', session.user.email);
  
  res.json({
    access_token: session.access_token,
    user: session.user,
    expires_at: session.expires_at
  });
});

// Очистка просроченных сессий каждые 10 минут
setInterval(() => {
  const now = Date.now();
  const expired = [];
  
  for (const [sessionId, session] of Object.entries(SESSIONS)) {
    if (session.expires_at < now) {
      expired.push(sessionId);
      delete SESSIONS[sessionId];
    }
  }
  
  if (expired.length > 0) {
    console.log('🧹 Cleaned expired sessions:', expired.length);
  }
}, 10 * 60 * 1000);

app.listen(port, () => {
  console.log(`🚀 Auth server running on port ${port}`);
  console.log(`📍 Available at: http://localhost:${port}`);
  console.log(`🔗 Google OAuth: http://localhost:${port}/auth/google`);
});
