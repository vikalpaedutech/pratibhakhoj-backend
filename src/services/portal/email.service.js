import nodemailer from "nodemailer";
import crypto from "crypto";

const smtpHost = () => process.env.MAIL_HOST || "mail.vikalpa.org.in";
const smtpPort = () => Number(process.env.MAIL_PORT || 465);
const smtpSecure = () =>
  String(process.env.MAIL_SECURE ?? "true").toLowerCase() === "true";

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = smtpHost();
  const port = smtpPort();
  const secure = smtpSecure();

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
    // Works for both implicit TLS (465) and STARTTLS (587).
    tls: {
      servername: host,
      rejectUnauthorized: true,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  return transporter;
};

export const sendVerificationEmail = async ({ to, verificationUrl, name }) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    throw new Error(
      "SMTP email configuration is missing. Set MAIL_USER and MAIL_PASSWORD in backend .env."
    );
  }

  const safeName = String(name || "User")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937">
    <div style="max-width:620px;margin:40px auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
      <h2 style="color:#27356f;margin-top:0">Vikalpa Foundation Trust</h2>
      <p>Hello ${safeName},</p>
      <p>Thank you for registering for the official Pratibha Khoj portal.</p>
      <p>Please click the button below to verify your email address and continue your account setup.</p>
      <p style="margin:30px 0">
        <a href="${verificationUrl}" style="display:inline-block;background:#27356f;color:#fff;text-decoration:none;padding:13px 24px;border-radius:7px;font-weight:600">
          Click here to verify your account
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280">
        This verification link expires in 24 hours. If you did not request this account, you can ignore this email.
      </p>
      <p>Regards,<br><strong>Vikalpa Foundation Trust</strong></p>
    </div>
  </body>
</html>`;

  const from = process.env.MAIL_FROM_EMAIL || process.env.MAIL_USER;
  const fromName = process.env.MAIL_FROM_NAME || "Vikalpa Foundation Trust";

  const mail = {
    from: `"${fromName}" <${from}>`,
    to,
    subject: "Verify your Vikalpa Foundation Trust account",
    text:
      `Hello ${name || "User"},\n\n` +
      `Please verify your email address using this link:\n${verificationUrl}\n\n` +
      `This verification link expires in 24 hours.\n\n` +
      `Regards,\nVikalpa Foundation Trust`,
    html,
  };

  const result = await getTransporter().sendMail(mail);
  return result;
};

export const createEmailVerificationToken = () =>
  crypto.randomBytes(32).toString("hex");

export const hashEmailVerificationToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
