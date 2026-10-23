import { ExamControllerSettings } from "../../models/portal/examControllerSettings.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

const defaults = () => ({
  key: "global",
  examActive: true,
  landingMessage: "Registrations coming soon",
});

export const readExamSettings = async () => {
  let settings = await ExamControllerSettings.findOne({ key: "global" }).lean();
  if (!settings) {
    try { settings = await ExamControllerSettings.create(defaults()); }
    catch (error) {
      if (error?.code !== 11000) throw error;
      settings = await ExamControllerSettings.findOne({ key: "global" }).lean();
    }
  }
  return settings?.toObject ? settings.toObject() : settings;
};

export const publicExamSettings = asyncHandler(async (_req, res) => {
  const settings = await readExamSettings();
  res.json(new ApiResponse(200, {
    examActive: settings.examActive !== false,
    landingMessage: settings.landingMessage || "Registrations coming soon",
    helplines: (settings.helplines || []).slice().sort((a, b) => a.order - b.order).map(({ label, number, order }) => ({ label, number, order })),
  }, "Exam settings fetched"));
});

export const adminGetExamSettings = asyncHandler(async (_req, res) => {
  const settings = await readExamSettings();
  res.json(new ApiResponse(200, settings, "Exam Controller settings fetched"));
});

export const updateExamSettings = asyncHandler(async (req, res) => {
  await readExamSettings();
  const updates = {};
  if (typeof req.body.examActive === "boolean") updates.examActive = req.body.examActive;
  if (req.body.landingMessage !== undefined) {
    const message = String(req.body.landingMessage || "").trim();
    if (!message) throw new ApiError(400, "Landing page message is required");
    if (message.length > 500) throw new ApiError(400, "Landing page message must be 500 characters or fewer");
    updates.landingMessage = message;
  }
  if (req.body.helplines !== undefined) {
    if (!Array.isArray(req.body.helplines)) throw new ApiError(400, "Helplines must be a list");
    const helplines = req.body.helplines.map((item, index) => ({
      label: String(item?.label || `Helpline ${index + 1}`).trim(),
      number: String(item?.number || "").trim(),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
    }));
    if (helplines.some((item) => !item.number || item.number.length > 40 || item.label.length > 80)) {
      throw new ApiError(400, "Each helpline needs a valid number and a label of at most 80 characters");
    }
    if (helplines.length > 20) throw new ApiError(400, "You can configure up to 20 helplines");
    updates.helplines = helplines;
  }
  const settings = await ExamControllerSettings.findOneAndUpdate(
    { key: "global" },
    { $set: updates },
    { new: true, runValidators: true }
  ).lean();
  res.json(new ApiResponse(200, settings, "Exam Controller settings updated"));
});
