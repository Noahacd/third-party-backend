function parseAllowedOrigins() {
  const raw =
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://127.0.0.1:4050';

  return [
    ...new Set(
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  ];
}

module.exports = {
  parseAllowedOrigins,
};
