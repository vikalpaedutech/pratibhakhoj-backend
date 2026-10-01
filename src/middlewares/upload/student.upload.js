import multer from "multer";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const resultTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const storage = multer.memoryStorage();

const studentFileFilter = (_req, file, callback) => {
  if (file.fieldname === "studentImage") {
    if (!imageTypes.has(file.mimetype)) {
      return callback(
        new Error("Student image must be JPG, PNG or WEBP")
      );
    }
    return callback(null, true);
  }

  if (file.fieldname === "previousClassResult") {
    if (!resultTypes.has(file.mimetype)) {
      return callback(
        new Error(
          "Previous class annual result must be JPG, PNG, WEBP or PDF"
        )
      );
    }
    return callback(null, true);
  }

  return callback(new Error(`Unexpected upload field: ${file.fieldname}`));
};

export const studentUpload = multer({
  storage,
  fileFilter: studentFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
  },
});

export const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});
