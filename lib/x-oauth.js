const crypto = require("crypto");

const X_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_USER_URL = "https://api.twitter.com/2/users/me";

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function createCodeChallenge(verifier) {
  return base64UrlEncode(crypto.createHash("sha256").update(verifier).digest());
}

function getXConfig() {
  const { X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI } = process.env;

  if (!X_CLIENT_ID || !X_CLIENT_SECRET || !X_REDIRECT_URI) {
    return null;
  }

  return {
    clientId: X_CLIENT_ID,
    clientSecret: X_CLIENT_SECRET,
    redirectUri: X_REDIRECT_URI,
  };
}

function buildAuthorizeUrl({ state, codeChallenge, forceReauth = false }) {
  const config = getXConfig();
  if (!config) {
    return null;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "users.read tweet.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  if (forceReauth) {
    params.set("prompt", "login");
  }

  return `${X_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code, codeVerifier) {
  const config = getXConfig();
  if (!config) {
    throw new Error("Missing X OAuth env");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const basicAuth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X token exchange failed: ${errorText}`);
  }

  return response.json();
}

async function fetchXUser(accessToken) {
  const response = await fetch(
    `${X_USER_URL}?user.fields=profile_image_url,name,username`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X user fetch failed: ${errorText}`);
  }

  const data = await response.json();
  return data.data;
}

module.exports = {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  exchangeCodeForToken,
  fetchXUser,
  getXConfig,
};
