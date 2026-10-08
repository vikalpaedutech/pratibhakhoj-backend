import crypto from "crypto";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const getBrevoConfig = () => {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  const fromEmail = String(process.env.BREVO_FROM_EMAIL || "").trim();
  const fromName = String(process.env.BREVO_FROM_NAME || "Vikalpa Foundation Trust").trim();

  if (!apiKey || !fromEmail) {
    throw new Error(
      "Brevo email configuration is missing. Set BREVO_API_KEY and BREVO_FROM_EMAIL in backend .env."
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    throw new Error("BREVO_FROM_EMAIL is not a valid email address.");
  }

  return { apiKey, fromEmail, fromName };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const maskEmail = (email) => {
  const value = String(email || "").trim();
  const [localPart, domain] = value.split("@");
  if (!localPart || !domain) return value || "unknown";
  if (localPart.length <= 2) return `***@${domain}`;
  return `${localPart.slice(0, 2)}***@${domain}`;
};

const createBrevoError = ({ status, code, message, responseBody }) => {
  const error = new Error(
    `Brevo email API failed: ${message || code || `HTTP ${status}`}`
  );
  error.statusCode = status;
  error.brevoCode = code || null;
  error.brevoMessage = message || null;
  error.brevoResponse = responseBody || null;
  return error;
};

export const sendVerificationEmail = async ({ to, verificationUrl, name }) => {
  const { apiKey, fromEmail, fromName } = getBrevoConfig();
  const recipientEmail = String(to || "").trim();

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("Recipient email address is invalid.");
  }

  const safeName = escapeHtml(name || "User");
  const safeVerificationUrl = escapeHtml(verificationUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937">
    <div style="max-width:620px;margin:40px auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
      <h2 style="color:#27356f;margin-top:0">Vikalpa Foundation Trust</h2>
      <p>Hello ${safeName},</p>
      <p>Thank you for registering for the official Pratibha Khoj portal.</p>
      <p>Please click the button below to verify your email address and continue your account setup.</p>
      <p style="margin:30px 0">
        <a href="${safeVerificationUrl}" style="display:inline-block;background:#27356f;color:#fff;text-decoration:none;padding:13px 24px;border-radius:7px;font-weight:600">
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

  const payload = {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: recipientEmail, name: String(name || "User").trim() }],
    subject: "Verify your Vikalpa Foundation Trust account",
    textContent:
      `Hello ${name || "User"},\n\n` +
      `Please verify your email address using this link:\n${verificationUrl}\n\n` +
      `This verification link expires in 24 hours.\n\n` +
      `Regards,\nVikalpa Foundation Trust`,
    htmlContent: html,
  };

  console.log(
    `[Brevo] Sending verification email | to=${maskEmail(recipientEmail)} | from=${maskEmail(fromEmail)} | endpoint=${BREVO_API_URL}`
  );

  let response;
  try {
    response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const cause = error?.cause?.message ? ` | cause=${error.cause.message}` : "";
    console.error(
      `[Brevo] Network request failed | name=${error?.name || "Error"} | message=${error?.message || "Unknown error"}${cause}`
    );
    throw new Error(
      `Brevo email request failed: ${error?.message || "network error"}`
    );
  }

  const responseText = await response.text();
  let responseData = {};
  try {
    responseData = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseData = { raw: responseText };
  }

  const responseMessage = responseData?.message || responseData?.code || "";

  if (!response.ok) {
    console.error(
      `[Brevo] API rejected email | status=${response.status} | code=${responseData?.code || "N/A"} | message=${responseData?.message || "N/A"} | response=${responseText.slice(0, 1000)}`
    );

    throw createBrevoError({
      status: response.status,
      code: responseData?.code,
      message: responseData?.message,
      responseBody: responseData,
    });
  }

  console.log(
    `[Brevo] Email accepted | status=${response.status} | messageId=${responseData?.messageId || "N/A"}${responseMessage ? ` | message=${responseMessage}` : ""}`
  );

  return responseData;
};

export const createEmailVerificationToken = () =>
  crypto.randomBytes(32).toString("hex");

export const hashEmailVerificationToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
