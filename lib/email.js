const { Resend } = require('resend');

const { RESEND_API_KEY, EMAIL_FROM = 'onboarding@resend.dev' } = process.env;

let resendClient = null;

function getResendClient() {
  if (!RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }

  return resendClient;
}

function isEmailConfigured() {
  return Boolean(RESEND_API_KEY);
}

async function sendVerificationCode(email, code) {
  const client = getResendClient();
  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email-otp] Dev mode — verification code for ${email}: ${code}`);
      return;
    }

    throw new Error('Email service is not configured');
  }

  const { error } = await client.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: '您的登录验证码',
    html: `
      <p>您的登录验证码是：</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>验证码 5 分钟内有效，请勿泄露给他人。</p>
    `,
  });

  if (error) {
    const message = error.message || 'Failed to send email';
    const err = new Error(message);
    err.resendError = error;
    throw err;
  }
}

module.exports = {
  isEmailConfigured,
  sendVerificationCode,
};
