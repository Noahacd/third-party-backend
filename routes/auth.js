const crypto = require('crypto');
const express = require('express');
const { OAuth2Client } = require('google-auth-library');

const refreshTokens = require('../db/refresh-tokens');
const emailOtps = require('../db/email-otps');
const users = require('../db/users');
const { clearAuthCookies, setAuthCookies } = require('../lib/cookies');
const { isEmailConfigured, sendVerificationCode } = require('../lib/email');
const {
  generateCode,
  getOtpExpiresAt,
  hashCode,
  isValidEmail,
  MAX_ATTEMPTS,
  normalizeEmail,
  OTP_SEND_COOLDOWN_MS,
} = require('../lib/email-otp');
const {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  exchangeCodeForToken,
  fetchXUser,
  getXConfig,
} = require('../lib/x-oauth');
const {
  getTelegramAuthUrls,
  getTelegramConfig,
  normalizeTelegramAuthData,
  toTelegramUser,
  verifyTelegramAuth,
} = require('../lib/telegram-auth');
const {
  createAccessToken,
  getAccessTokenMaxAgeMs,
  getRefreshTokenExpiresAt,
  getRefreshTokenMaxAgeMs,
  verifyAccessToken,
} = require('../lib/tokens');

const router = express.Router();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  FRONTEND_URL = 'http://127.0.0.1:4050',
} = process.env;

const SCOPES = ['openid', 'email', 'profile'];

function getOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      'Missing Google OAuth env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI'
    );
  }

  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
  };
}

function issueSession(res, user) {
  const accessToken = createAccessToken(user);
  const { id: refreshId, token: refreshToken } =
    refreshTokens.createRefreshToken(user.id, getRefreshTokenExpiresAt());

  setAuthCookies(res, {
    accessToken,
    refreshToken,
    accessMaxAge: getAccessTokenMaxAgeMs(),
    refreshMaxAge: getRefreshTokenMaxAgeMs(),
  });

  return { refreshId, accessToken };
}

function tryRefreshSession(req, res) {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return null;
  }

  const stored = refreshTokens.findValidToken(refreshToken);
  if (!stored) {
    clearAuthCookies(res);
    return null;
  }

  const user = users.findById(stored.user_id);
  if (!user) {
    refreshTokens.revokeToken(stored.id);
    clearAuthCookies(res);
    return null;
  }

  refreshTokens.revokeToken(stored.id);
  const { accessToken } = issueSession(res, user);

  return { user, accessToken };
}

function authMiddleware(req, res, next) {
  let accessToken = req.cookies?.access_token;
  let payload = verifyAccessToken(accessToken);

  if (!payload) {
    const refreshed = tryRefreshSession(req, res);
    if (!refreshed) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    payload = {
      sub: refreshed.user.id,
      email: refreshed.user.email,
      name: refreshed.user.name,
      picture: refreshed.user.picture,
    };
    accessToken = refreshed.accessToken;
  }

  req.user = payload;
  req.accessToken = accessToken;
  next();
}

router.get('/google', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const forceReauth = req.query.reauth === '1';

  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: forceReauth ? 'login consent' : 'select_account',
  });

  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  if (!code || !state || state !== savedState) {
    return res.redirect(`${FRONTEND_URL}/?error=invalid_state`);
  }

  res.clearCookie('oauth_state', { path: '/' });

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const user = users.upsertGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    });

    issueSession(res, user);
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    res.redirect(`${FRONTEND_URL}/?error=oauth_failed`);
  }
});

const oauthCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 10 * 60 * 1000,
};

router.get('/x', (req, res) => {
  if (!getXConfig()) {
    return res.redirect(`${FRONTEND_URL}/?error=x_not_configured`);
  }

  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const forceReauth = req.query.reauth === '1';
  const authorizeUrl = buildAuthorizeUrl({
    state,
    codeChallenge,
    forceReauth,
  });

  res.cookie('x_oauth_state', state, oauthCookieOptions);
  res.cookie('x_code_verifier', codeVerifier, oauthCookieOptions);
  res.redirect(authorizeUrl);
});

router.get('/x/callback', async (req, res) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.x_oauth_state;
  const codeVerifier = req.cookies?.x_code_verifier;

  res.clearCookie('x_oauth_state', { path: '/' });
  res.clearCookie('x_code_verifier', { path: '/' });

  if (!code || !state || state !== savedState || !codeVerifier) {
    return res.redirect(`${FRONTEND_URL}/?error=invalid_state`);
  }

  try {
    const tokenData = await exchangeCodeForToken(code, codeVerifier);
    const xUser = await fetchXUser(tokenData.access_token);
    const username = xUser.username ?? xUser.id;
    const email = `${username}@users.x.local`;

    const user = users.upsertXUser({
      xId: xUser.id,
      email,
      name: xUser.name ?? username,
      picture: xUser.profile_image_url ?? '',
    });

    issueSession(res, user);
    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('X OAuth callback failed:', error);
    res.redirect(`${FRONTEND_URL}/?error=x_oauth_failed`);
  }
});

function handleTelegramAuth(req, res, authInput) {
  const config = getTelegramConfig();
  if (!config) {
    return { error: 'telegram_not_configured', status: 503 };
  }

  const authData = normalizeTelegramAuthData(authInput);
  if (!verifyTelegramAuth(authData, config.botToken)) {
    return { error: 'invalid_telegram_auth', status: 401 };
  }

  const user = users.upsertTelegramUser(toTelegramUser(authData));
  const { accessToken } = issueSession(res, user);

  return {
    user: toPublicUser(user),
    accessToken,
  };
}

router.get('/telegram/config', (_req, res) => {
  const config = getTelegramConfig();
  if (!config) {
    return res.status(404).json({ error: 'Telegram login is not configured' });
  }

  const urls = getTelegramAuthUrls(FRONTEND_URL);
  if (!urls) {
    return res.status(500).json({ error: 'Invalid Telegram bot token' });
  }

  res.json({
    botUsername: config.botUsername.replace(/^@/, ''),
    loginUrl: urls.loginUrl,
    logoutUrl: urls.logoutUrl,
  });
});

router.post('/telegram', (req, res) => {
  const result = handleTelegramAuth(req, res, req.body);
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.json({
    user: result.user,
    accessToken: result.accessToken,
  });
});

router.post('/email/send-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email ?? '');

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  if (!isEmailConfigured() && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ error: 'email_not_configured' });
  }

  const lastSentAt = emailOtps.getLastSentAt(email);
  if (lastSentAt && Date.now() - lastSentAt.getTime() < OTP_SEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'send_too_frequent' });
  }

  const code = generateCode();
  const codeHash = hashCode(code, email);
  const expiresAt = getOtpExpiresAt();

  emailOtps.createOtp(email, codeHash, expiresAt);

  try {
    await sendVerificationCode(email, code);
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to send verification email:', error);
    const payload = { error: 'send_failed' };
    if (process.env.NODE_ENV !== 'production' && error.message) {
      payload.detail = error.message;
    }
    res.status(500).json(payload);
  }
});

router.post('/email/verify', (req, res) => {
  const email = normalizeEmail(req.body?.email ?? '');
  const code = String(req.body?.code ?? '').trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const otp = emailOtps.findLatestValidOtp(email);
  if (!otp) {
    return res.status(401).json({ error: 'invalid_or_expired_code' });
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }

  if (new Date(otp.expires_at) <= new Date()) {
    return res.status(401).json({ error: 'invalid_or_expired_code' });
  }

  const expectedHash = hashCode(code, email);
  if (expectedHash !== otp.code_hash) {
    emailOtps.incrementAttempts(otp.id);
    return res.status(401).json({ error: 'invalid_or_expired_code' });
  }

  emailOtps.markUsed(otp.id);

  const user = users.upsertEmailUser({ email });
  const { accessToken } = issueSession(res, user);

  res.json({
    user: toPublicUser(user),
    accessToken,
  });
});

router.get('/telegram/callback', (req, res) => {
  if (!req.query.id || !req.query.hash) {
    return res.redirect(`${FRONTEND_URL}/`);
  }

  const result = handleTelegramAuth(req, res, req.query);
  if (result.error) {
    return res.redirect(`${FRONTEND_URL}/?error=${result.error}`);
  }

  res.redirect(`${FRONTEND_URL}/dashboard`);
});

router.post('/refresh', (req, res) => {
  try {
    const refreshed = tryRefreshSession(req, res);
    if (!refreshed) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({
      user: toPublicUser(refreshed.user),
      accessToken: refreshed.accessToken,
    });
  } catch (error) {
    console.error('[auth/refresh]', error);
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = users.findById(req.user.sub);
  if (!user) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    user: toPublicUser(user),
    accessToken: req.accessToken,
  });
});

router.post('/logout', (req, res) => {
  const payload = verifyAccessToken(req.cookies?.access_token);
  if (payload?.sub) {
    refreshTokens.revokeAllForUser(payload.sub);
  } else {
    const stored = refreshTokens.findValidToken(
      req.cookies?.refresh_token ?? ''
    );
    if (stored) {
      refreshTokens.revokeToken(stored.id);
    }
  }

  clearAuthCookies(res);
  res.json({ ok: true });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
