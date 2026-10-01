import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import spacesClient from "../config/spaces.js";

export const uploadToSpaces = async ({ file, folder, fileName }) => {
  if (!file?.buffer) throw new Error("File buffer is required");
  if (!folder) throw new Error("Folder is required");
  if (!fileName) throw new Error("File name is required");

  const key = `${folder}/${fileName}`;

  await spacesClient.send(
    new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
      ACL: "private",
    })
  );

  return {
    key,
    url: `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`,
    fileName,
    originalName: file.originalname,
    mimeType: file.mimetype,
  };
};

export const deleteFromSpaces = async (key) => {
  if (!key) return false;
  await spacesClient.send(
    new DeleteObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
    })
  );
  return true;
};

export const getSignedUrlForSpacesKey = async (key, expiresIn = 3600) => {
  if (!key) throw new Error("Spaces object key is required");

  return getSignedUrl(
    spacesClient,
    new GetObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
    }),
    { expiresIn }
  );
};
