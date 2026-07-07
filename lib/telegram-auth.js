const crypto = require("crypto");

const AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;

  if (!botToken || !botUsername) {
    return null;
  }

  return { botToken, botUsername };
}

function verifyTelegramAuth(authData, botToken) {
  const { hash, ...fields } = authData;

  if (!hash || !fields.id || !fields.auth_date) {
    return false;
  }

  const authDate = Number(fields.auth_date);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(authDate) || now - authDate > AUTH_MAX_AGE_SECONDS) {
    return false;
  }

  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secretKey = crypto
    .createHash("sha256")
    .update(botToken.trim())
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, "hex"),
      Buffer.from(hash, "hex"),
    );
  } catch {
    return false;
  }
}

function normalizeTelegramAuthData(input) {
  const fields = {};

  if (input.id !== undefined) {
    fields.id = String(input.id);
  }
  if (input.first_name !== undefined) {
    fields.first_name = String(input.first_name);
  }
  if (input.last_name !== undefined) {
    fields.last_name = String(input.last_name);
  }
  if (input.username !== undefined) {
    fields.username = String(input.username);
  }
  if (input.photo_url !== undefined) {
    fields.photo_url = String(input.photo_url);
  }
  if (input.auth_date !== undefined) {
    fields.auth_date = String(input.auth_date);
  }
  if (input.hash !== undefined) {
    fields.hash = String(input.hash);
  }

  return fields;
}

function getBotIdFromToken(botToken) {
  const botId = botToken.split(":")[0];
  return /^\d+$/.test(botId) ? botId : null;
}

function buildTelegramLogoutUrl({ botId, origin }) {
  const params = new URLSearchParams({
    bot_id: botId,
    origin,
  });

  return `https://oauth.telegram.org/auth/logout?${params.toString()}`;
}

function buildTelegramLoginUrl({ botId, origin }) {
  const params = new URLSearchParams({
    bot_id: botId,
    origin,
    request_access: "write",
  });

  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

function getTelegramAuthUrls(frontendUrl) {
  const config = getTelegramConfig();
  if (!config) {
    return null;
  }

  const botId = getBotIdFromToken(config.botToken);
  if (!botId) {
    return null;
  }

  const origin = frontendUrl.replace(/\/$/, "");

  return {
    loginUrl: buildTelegramLoginUrl({ botId, origin }),
    logoutUrl: buildTelegramLogoutUrl({ botId, origin }),
  };
}

function getTelegramLoginUrl(frontendUrl) {
  return getTelegramAuthUrls(frontendUrl)?.loginUrl ?? null;
}

function toTelegramUser(authData) {
  const username = authData.username || `user${authData.id}`;
  const name = [authData.first_name, authData.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    telegramId: String(authData.id),
    email: `${username}@users.telegram.local`,
    name: name || username,
    picture: authData.photo_url || "",
  };
}

module.exports = {
  getBotIdFromToken,
  getTelegramAuthUrls,
  getTelegramConfig,
  getTelegramLoginUrl,
  normalizeTelegramAuthData,
  toTelegramUser,
  verifyTelegramAuth,
};
