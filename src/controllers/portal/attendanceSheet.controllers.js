import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { School } from "../../models/portal/school.models.js";
import { District } from "../../models/portal/district.models.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createZip } from "../../utils/zip.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHOOL_TYPES = {
  MIDDLE: "Middle School",
  OTHER: "OTHER_SCHOOL_TYPES",
};

export const listAttendanceSheetDistricts = asyncHandler(async (_req, res) => {
  const districts = await District.find({ isActive: true })
    .select("_id districtName")
    .sort({ districtName: 1 })
    .lean();
  res.json({ success: true, data: districts });
});

const PAGE_LEFT = 42;
const PAGE_RIGHT = 553;
const TABLE_WIDTH = PAGE_RIGHT - PAGE_LEFT;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 27;

const drawPageHeader = (doc, districtName, middleOnly, brandingDir) => {
  const haryanaLogo = path.join(brandingDir, "haryana.png");
  const buniyaadLogo = path.join(brandingDir, "Buniyaad.png");

  doc.save();
  doc.lineWidth(0.8).strokeColor("#777")
    .rect(14, 14, doc.page.width - 28, doc.page.height - 28)
    .stroke();
  doc.restore();

  // Government and Mission Buniyaad marks, positioned on either side of the heading.
  try { doc.image(haryanaLogo, PAGE_LEFT + 1, 27, { fit: [58, 64] }); } catch {}
  try { doc.image(buniyaadLogo, PAGE_RIGHT - 59, 25, { fit: [58, 66] }); } catch {}

  const headingX = PAGE_LEFT + 67;
  const headingWidth = TABLE_WIDTH - 134;
  doc.font("Times-Bold").fillColor("#111")
    .fontSize(19)
    .text("MISSION BUNIYAAD", headingX, 30, { width: headingWidth, align: "center", lineBreak: false })
    .fontSize(14)
    .text("DISTRICT LEVEL CAMPAIGN 2027-29", headingX, 53, { width: headingWidth, align: "center", lineBreak: false })
    .fontSize(13)
    .text("ATTENDANCE SHEET", headingX, 72, { width: headingWidth, align: "center", lineBreak: false })
    .fontSize(9.5)
    .text(
      middleOnly
        ? "(For Government Middle Schools)"
        : "(GHS, GSSS, GGSSS, GMSSSS, AMSSSS)",
      headingX,
      90,
      { width: headingWidth, align: "center", lineBreak: false }
    );

  // Latest requested format has only Date and District fields (no Venue Name).
  const infoY = 119;
  const infoH = 22;
  const dateWidth = Math.round(TABLE_WIDTH * 0.49);
  const districtWidth = TABLE_WIDTH - dateWidth;
  doc.lineWidth(0.8).strokeColor("#222")
    .rect(PAGE_LEFT, infoY, dateWidth, infoH)
    .rect(PAGE_LEFT + dateWidth, infoY, districtWidth, infoH)
    .stroke();
  doc.font("Times-Bold").fontSize(9.5).fillColor("#111")
    .text("Date: -", PAGE_LEFT + 5, infoY + 6, { width: dateWidth - 10, lineBreak: false });
  const districtCellX = PAGE_LEFT + dateWidth + 5;
  doc.font("Times-Bold").fontSize(9.5).fillColor("#111");
  const districtLabelWidth = doc.widthOfString("District:");
  doc.text("District:", districtCellX, infoY + 6, { lineBreak: false });
  doc.font("Times-Bold").fontSize(12).fillColor("#111")
    .text(districtName || "-", districtCellX + districtLabelWidth + 5, infoY + 4, {
      width: districtWidth - districtLabelWidth - 15,
      lineBreak: false,
      ellipsis: true,
    });

  doc._middleOnly = middleOnly;
  doc._tableX = PAGE_LEFT;
  doc._tableWidths = middleOnly
    ? [32, 137, 80, 192, 70]
    : [32, 150, 60, 160, 109];
  doc.y = infoY + infoH + 10;
};

const drawBlockHeading = (doc, blockName) => {
  const total = TABLE_WIDTH;
  const y = doc.y;
  doc.rect(PAGE_LEFT, y, total, 27).fillAndStroke("#d9e8f3", "#222");
  doc.font("Times-Bold").fontSize(12).fillColor("#111")
    .text(String(blockName || "Other").toUpperCase(), PAGE_LEFT + 3, y + 7, {
      width: total - 6,
      align: "center",
      lineBreak: false,
    });
  doc.y = y + 27;
};

const drawTableHeader = (doc) => {
  const headers = ["SR. NO", "SCHOOL NAME", "CLASS", "STUDENT NAME", "SIGNATURE"];
  const widths = doc._tableWidths;
  const y = doc.y;
  doc.rect(PAGE_LEFT, y, TABLE_WIDTH, HEADER_HEIGHT).fillAndStroke("#dce8f2", "#222");
  let x = PAGE_LEFT;
  headers.forEach((header, index) => {
    if (index > 0) {
      doc.moveTo(x, y).lineTo(x, y + HEADER_HEIGHT).lineWidth(0.8).stroke("#222");
    }
    doc.font("Times-Bold").fontSize(9).fillColor("#111")
      .text(header, x + 2, y + 8, {
        width: widths[index] - 4,
        height: 13,
        align: "center",
        lineBreak: false,
      });
    x += widths[index];
  });
  doc.y = y + HEADER_HEIGHT;
};

const drawSchoolRows = (doc, school, schoolNumber, middleOnly) => {
  const widths = doc._tableWidths;
  const rowCount = middleOnly ? 2 : 4;
  const groupHeight = ROW_HEIGHT * rowCount;
  const y = doc.y;

  // Serial number and school name are vertically merged across all class rows.
  doc.lineWidth(0.8).strokeColor("#222")
    .rect(PAGE_LEFT, y, widths[0], groupHeight)
    .rect(PAGE_LEFT + widths[0], y, widths[1], groupHeight)
    .stroke();

  // Class, student-name and signature cells are separate for every row.
  let x = PAGE_LEFT + widths[0] + widths[1];
  for (let row = 0; row < rowCount; row += 1) {
    let cellX = x;
    for (let col = 2; col < widths.length; col += 1) {
      doc.rect(cellX, y + row * ROW_HEIGHT, widths[col], ROW_HEIGHT).stroke();
      cellX += widths[col];
    }
  }

  doc.font("Times-Roman").fontSize(9).fillColor("#111")
    .text(String(schoolNumber), PAGE_LEFT + 2, y + (groupHeight / 2) - 5, {
      width: widths[0] - 4,
      align: "center",
      lineBreak: false,
    });

  doc.font("Times-Bold").fontSize(10).fillColor("#111")
    .text(String(school.schoolName || "").toUpperCase(), PAGE_LEFT + widths[0] + 5, y + 5, {
      width: widths[1] - 10,
      height: groupHeight - 10,
      align: "left",
      valign: "center",
      ellipsis: true,
    });

  const classValues = middleOnly ? ["08th", "08th"] : ["08th", "08th", "10th", "10th"];
  const classX = PAGE_LEFT + widths[0] + widths[1];
  for (let row = 0; row < rowCount; row += 1) {
    doc.font("Times-Bold").fontSize(10).fillColor("#111")
      .text(classValues[row], classX + 2, y + row * ROW_HEIGHT + 9, {
        width: widths[2] - 4,
        align: "center",
        lineBreak: false,
      });
  }

  doc.y = y + groupHeight;
};

export const downloadAttendanceSheetDlc = asyncHandler(async (req, res) => {
  const { districtId, schoolType } = req.query;
  if (!districtId || !schoolType) {
    throw new ApiError(400, "District and school type are required");
  }

  const district = await District.findOne({ _id: districtId, isActive: true }).lean();
  if (!district) throw new ApiError(404, "District not found");

  const schoolFilter = { districtId, isActive: true };
  const middleOnly = schoolType === SCHOOL_TYPES.MIDDLE;
  if (middleOnly) {
    schoolFilter.schoolType = "Middle School";
  } else if (schoolType === SCHOOL_TYPES.OTHER) {
    schoolFilter.schoolType = { $nin: ["Middle School", null, ""] };
  } else {
    throw new ApiError(400, "Invalid school type selected");
  }

  const schools = await School.find(schoolFilter)
    .select("schoolName schoolType blockId")
    .populate("blockId", "blockName")
    .sort({ schoolName: 1 })
    .lean();

  if (!schools.length) {
    throw new ApiError(404, "No schools found for the selected district and school type");
  }

  const schoolTypeOrder = [
    "High School",
    "Senior Secondary School",
    "Model Sanskriti School",
    "Aarohi School",
  ];
  const schoolTypeRank = (type) => {
    const index = schoolTypeOrder.indexOf(String(type || "").trim());
    return index === -1 ? schoolTypeOrder.length : index;
  };

  schools.sort((a, b) => {
    const blockCompare = (a.blockId?.blockName || "Other").localeCompare(
      b.blockId?.blockName || "Other",
      undefined,
      { numeric: true, sensitivity: "base" }
    );
    if (blockCompare) return blockCompare;
    const typeCompare = schoolTypeRank(a.schoolType) - schoolTypeRank(b.schoolType);
    if (typeCompare) return typeCompare;
    return (a.schoolName || "").localeCompare(
      b.schoolName || "",
      undefined,
      { numeric: true, sensitivity: "base" }
    );
  });

  const brandingDir = path.resolve(__dirname, "../../../public/branding");
  const groups = new Map();
  for (const school of schools) {
    const blockName = school.blockId?.blockName || "Other";
    if (!groups.has(blockName)) groups.set(blockName, []);
    groups.get(blockName).push(school);
  }

  // Keep the existing ZIP behavior: one separate PDF for every block.
  const pdfFiles = [];
  for (const [blockName, blockSchools] of groups) {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 20, bottom: 28, left: PAGE_LEFT, right: 42 },
      autoFirstPage: true,
      bufferPages: false,
    });

    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const startBlockPage = () => {
        drawPageHeader(doc, district.districtName, middleOnly, brandingDir);
        drawBlockHeading(doc, blockName);
        drawTableHeader(doc);
      };

      startBlockPage();
      let schoolNumber = 0;
      const rowsPerSchool = middleOnly ? 2 : 4;
      const requiredHeight = ROW_HEIGHT * rowsPerSchool;

      for (const school of blockSchools) {
        if (doc.y + requiredHeight > doc.page.height - 32) {
          doc.addPage();
          startBlockPage();
        }
        schoolNumber += 1;
        drawSchoolRows(doc, school, schoolNumber, middleOnly);
      }

      doc.end();
    });

    const safeBlockName = blockName
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "other";
    pdfFiles.push({
      name: `${String(pdfFiles.length + 1).padStart(2, "0")}-${safeBlockName}.pdf`,
      data: pdfBuffer,
    });
  }

  const zipBuffer = createZip(pdfFiles);
  const districtSlug = district.districtName
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="attendance-sheets-${districtSlug}.zip"`
  );
  res.setHeader("Content-Length", zipBuffer.length);
  res.send(zipBuffer);
});
