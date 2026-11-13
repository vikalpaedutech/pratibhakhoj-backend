import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { School } from "../../models/portal/school.models.js";
import { District } from "../../models/portal/district.models.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

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

const drawPageHeader = (doc, districtName, middleOnly, brandingDir) => {
  const pageWidth = doc.page.width;
  const left = 42;
  const right = pageWidth - 42;
  const haryanaLogo = path.join(brandingDir, "haryana.png");
  const buniyaadLogo = path.join(brandingDir, "Buniyaad.png");

  if (doc.y > 70) doc.addPage();
  const top = 25;
  doc.save();
  doc.lineWidth(1).strokeColor("#555")
    .moveTo(14, 14).lineTo(pageWidth - 14, 14)
    .moveTo(14, 14).lineTo(14, doc.page.height - 14)
    .moveTo(pageWidth - 14, 14).lineTo(pageWidth - 14, doc.page.height - 14)
    .moveTo(14, doc.page.height - 14).lineTo(pageWidth - 14, doc.page.height - 14)
    .stroke();
  doc.restore();
  try { doc.image(haryanaLogo, left + 3, top, { fit: [48, 55] }); } catch {}
  try { doc.image(buniyaadLogo, right - 57, top, { fit: [54, 55] }); } catch {}
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#5c4431")
    .text("PRATIBHA KHOJ", left + 60, top + 4, { width: right - left - 120, align: "center" });
  doc.fontSize(11).fillColor("#111")
    .text("MISSION BUNIYAAD/ HARYANA SUPER 100", left + 60, top + 25, { width: right - left - 120, align: "center" });
  doc.fontSize(10).text("DISTRICT LEVEL CAMPAIGN 2027-29", left + 60, top + 42, { width: right - left - 120, align: "center" });
  doc.fontSize(11).text("STUDENT ATTENDANCE SHEET", left + 60, top + 58, { width: right - left - 120, align: "center" });

  const infoY = top + 88;
  const infoH = 23;
  const infoWidths = [120, 175, right - left - 295];
  const infoLabels = ["Date: -", `District: ${districtName}`, "Venue Name: -"];
  let x = left;
  infoLabels.forEach((label, i) => {
    doc.rect(x, infoY, infoWidths[i], infoH).stroke("#222");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111")
      .text(label, x + 5, infoY + 7, { width: infoWidths[i] - 10, height: 10 });
    x += infoWidths[i];
  });

  doc.y = infoY + infoH + 10;
  doc._middleOnly = middleOnly;
  doc._tableX = left;
  doc._tableWidths = middleOnly ? [28, 140, 155, 188] : [28, 120, 100, 80, 105, 78];
  doc._tableHeaders = middleOnly
    ? ["SR. NO", "SCHOOL NAME", "8TH STUDENT NAME", "SIGNATURE"]
    : ["SR. NO", "SCHOOL NAME", "8TH STUDENT NAME", "SIGNATURE", "10TH STUDENT NAME", "SIGNATURE"];
};

const drawTableHeader = (doc) => {
  const x0 = doc._tableX;
  const widths = doc._tableWidths;
  const headers = doc._tableHeaders;
  const total = widths.reduce((a, b) => a + b, 0);
  const y = doc.y;
  doc.rect(x0, y, total, 28).fillAndStroke("#dce8f2", "#222");
  let x = x0;
  headers.forEach((header, i) => {
    if (i > 0) doc.moveTo(x, y).lineTo(x, y + 28).stroke("#222");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#111")
      .text(header, x + 2, y + 7, { width: widths[i] - 4, height: 16, align: "center", valign: "center" });
    x += widths[i];
  });
  doc.y = y + 28;
};

export const downloadAttendanceSheetDlc = asyncHandler(async (req, res) => {
  const { districtId, schoolType } = req.query;
  if (!districtId || !schoolType) throw new ApiError(400, "District and school type are required");

  const district = await District.findOne({ _id: districtId, isActive: true }).lean();
  if (!district) throw new ApiError(404, "District not found");

  const schoolFilter = { districtId, isActive: true };
  const middleOnly = schoolType === SCHOOL_TYPES.MIDDLE;
  if (middleOnly) schoolFilter.schoolType = "Middle School";
  else schoolFilter.schoolType = { $nin: ["Middle School", null, ""] };

  const schools = await School.find(schoolFilter)
    .select("schoolName schoolType blockId")
    .populate("blockId", "blockName")
    .sort({ schoolName: 1 })
    .lean();

  if (!schools.length) throw new ApiError(404, "No schools found for the selected district and school type");

  const schoolTypeOrder = [
    "High School",
    "Senior Secondary School",
    "Model Sanskriti School",
    "Aarohi School",
  ];
  const schoolTypeRank = (type) => {
    const index = schoolTypeOrder.indexOf(String(type || "").trim());
    return index === -1 ? schoolTypeOrder.length : index; // Other / unlisted types last
  };
  schools.sort((a, b) => {
    const blockCompare = (a.blockId?.blockName || "Other").localeCompare(
      b.blockId?.blockName || "Other", undefined, { numeric: true, sensitivity: "base" }
    );
    if (blockCompare) return blockCompare;
    const typeCompare = schoolTypeRank(a.schoolType) - schoolTypeRank(b.schoolType);
    if (typeCompare) return typeCompare;
    return (a.schoolName || "").localeCompare(
      b.schoolName || "", undefined, { numeric: true, sensitivity: "base" }
    );
  });

  const brandingDir = path.resolve(__dirname, "../../../public/branding");
  const doc = new PDFDocument({ size: "A4", margins: { top: 24, bottom: 30, left: 42, right: 42 }, autoFirstPage: true, bufferPages: false });
  const fileName = `attendance-sheet-${district.districtName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  let currentBlock = "";
  let y = 0;
  const rowHeight = 29;
  const totalWidth = middleOnly ? 523 : 523;
  const groups = new Map();
  for (const school of schools) {
    const blockName = school.blockId?.blockName || "Other";
    if (!groups.has(blockName)) groups.set(blockName, []);
    groups.get(blockName).push(school);
  }

  drawPageHeader(doc, district.districtName, middleOnly, brandingDir);
  const drawBlockHeading = (blockName, separateBlock = true) => {
    // Keep each block's heading visually detached from the previous block's table.
    const blockGap = separateBlock ? 14 : 0;
    if (doc.y + blockGap + 22 + 28 + rowHeight * 2 > doc.page.height - 35) {
      doc.addPage();
      drawPageHeader(doc, district.districtName, middleOnly, brandingDir);
    } else if (blockGap) {
      doc.y += blockGap;
    }
    const widths = doc._tableWidths;
    const total = widths.reduce((a, b) => a + b, 0);
    doc.rect(doc._tableX, doc.y, total, 22).fillAndStroke("#e5edf5", "#222");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111")
      .text(blockName.toUpperCase(), doc._tableX + 2, doc.y + 6, { width: total - 4, align: "center" });
    doc.y += 22;
    drawTableHeader(doc);
  };

  for (const [blockName, blockSchools] of groups) {
    currentBlock = blockName;
    let schoolNumber = 0; // Serial numbers restart from 1 for every block.
    drawBlockHeading(currentBlock, true);
    for (const school of blockSchools) {
      if (doc.y + rowHeight * 2 > doc.page.height - 35) {
        doc.addPage();
        drawPageHeader(doc, district.districtName, middleOnly, brandingDir);
        drawBlockHeading(currentBlock, false);
      }
      schoolNumber += 1;
      const x0 = doc._tableX;
      const widths = doc._tableWidths;
      const y0 = doc.y;
      const h = rowHeight * 2;
      let x = x0;
      widths.forEach((width, i) => {
        doc.rect(x, y0, width, h).stroke("#222");
        x += width;
      });
      doc.moveTo(x0 + widths[0] + widths[1], y0 + rowHeight)
        .lineTo(x0 + widths.reduce((a, b) => a + b, 0), y0 + rowHeight).stroke("#222");
      doc.font("Helvetica").fontSize(8).fillColor("#111")
        .text(String(schoolNumber), x0 + 2, y0 + 23, { width: widths[0] - 4, align: "center" });
      doc.font("Helvetica").fontSize(7.5)
        .text(school.schoolName || "", x0 + widths[0] + 4, y0 + 24, {
          width: widths[1] - 8, height: h - 8, align: "left", valign: "center", ellipsis: true,
        });
      doc.y = y0 + h;
    }
  }

  doc.end();
});
