const isProduction = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

function setAuthCookies(
  res,
  { accessToken, refreshToken, accessMaxAge, refreshMaxAge },
) {
  res.cookie("access_token", accessToken, {
    ...baseCookieOptions,
    maxAge: accessMaxAge,
  });

  res.cookie("refresh_token", refreshToken, {
    ...baseCookieOptions,
    maxAge: refreshMaxAge,
  });
}

function clearAuthCookies(res) {
  res.clearCookie("access_token", { ...baseCookieOptions, maxAge: 0 });
  res.clearCookie("refresh_token", { ...baseCookieOptions, maxAge: 0 });
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
};
