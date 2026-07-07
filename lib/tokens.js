const jwt = require("jsonwebtoken");

const {
  JWT_SECRET,
  ACCESS_TOKEN_EXPIRES_IN = "15m",
  REFRESH_TOKEN_EXPIRES_IN = "7d",
} = process.env;

function parseDurationMs(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );
}

function verifyAccessToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getRefreshTokenExpiresAt() {
  return new Date(Date.now() + parseDurationMs(REFRESH_TOKEN_EXPIRES_IN));
}

function getAccessTokenMaxAgeMs() {
  return parseDurationMs(ACCESS_TOKEN_EXPIRES_IN);
}

function getRefreshTokenMaxAgeMs() {
  return parseDurationMs(REFRESH_TOKEN_EXPIRES_IN);
}

module.exports = {
  createAccessToken,
  verifyAccessToken,
  getRefreshTokenExpiresAt,
  getAccessTokenMaxAgeMs,
  getRefreshTokenMaxAgeMs,
};
