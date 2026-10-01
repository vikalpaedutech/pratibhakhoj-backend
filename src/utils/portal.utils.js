import crypto from "crypto";

export const generateSlipId = (name, srn) => {
  const letters = String(name || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase().padEnd(4, "0");
  const digits = String(srn || "").slice(-6).padStart(6, "0");
  return `${letters}${digits}`;
};

export const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
