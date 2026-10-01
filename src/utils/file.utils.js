import crypto from "crypto";
import path from "path";
import { uploadToSpaces } from "./space.utils.js";

export const saveUploadedFile = async (
  file,
  folder = "pratibhakhoj/students"
) => {
  if (!file) return null;

  const extension = path.extname(file.originalname || "").toLowerCase();
  const safeName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

  return uploadToSpaces({
    file,
    folder,
    fileName: safeName,
  });
};
