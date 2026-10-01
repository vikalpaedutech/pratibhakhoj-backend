// import fs from "fs";
// import path from "path";
// import PDFDocument from "pdfkit";
// import { getSignedUrlForSpacesKey } from "../../utils/space.utils.js";
// import { Writable } from "node:stream";

// const safeText = (value, fallback = "-") => {
//   if (value === undefined || value === null || String(value).trim() === "") return fallback;
//   return String(value).trim();
// };

// const getFontPaths = () => ({
//   latin: path.resolve(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
//   devanagari: path.resolve(process.cwd(), "public/fonts/NotoSansDevanagari-Regular.ttf"),
//   devanagariBold: path.resolve(process.cwd(), "public/fonts/NotoSansDevanagari-Bold.ttf"),
// });

// const hasDevanagari = (value) => /[\u0900-\u097F]/.test(String(value ?? ""));

// /**
//  * PDFKit does not have CSS-style font fallback. The bundled Devanagari font
//  * contains Devanagari glyphs but not Latin glyphs. Render mixed English/Hindi
//  * strings as separate font runs so neither language is lost.
//  */
// const drawMixedText = (doc, value, x, y, options = {}) => {
//   const text = safeText(value, "");
//   if (!text) return;

//   const { bold = false, ...textOptions } = options;
//   const parts = text.split(/([\u0900-\u097F]+)/g).filter(Boolean);

//   parts.forEach((part, index) => {
//     doc.font(
//       hasDevanagari(part)
//         ? (bold ? "NotoSansDevanagari-Bold" : "NotoSansDevanagari-Regular")
//         : "NotoSans-Regular"
//     );

//     if (index === 0) {
//       doc.text(part, x, y, {
//         ...textOptions,
//         continued: index < parts.length - 1,
//       });
//     } else {
//       doc.text(part, {
//         ...textOptions,
//         continued: index < parts.length - 1,
//       });
//     }
//   });
// };

// const loadStudentPhoto = async (student) => {
//   if (!student?.studentImage?.key) return null;

//   try {
//     const signedUrl = await getSignedUrlForSpacesKey(student.studentImage.key, 600);
//     const response = await fetch(signedUrl);
//     if (!response.ok) return null;
//     return Buffer.from(await response.arrayBuffer());
//   } catch {
//     return null;
//   }
// };

// const drawCell = (doc, x, y, width, height, text, { bold = false, align = "left" } = {}) => {
//   doc.rect(x, y, width, height).stroke();
//   doc.fontSize(7.2).fillColor("#111");

//   drawMixedText(doc, safeText(text), x + 4, y + 4, {
//     width: width - 8,
//     height: height - 7,
//     align,
//     lineBreak: false,
//     ellipsis: true,
//     bold,
//   });
// };

// const drawBilingualInstruction = (doc, number, english, hindi, x, y, width) => {
//   const text = `${number}. ${english} (${hindi})`;
//   doc.fontSize(7.2).fillColor("#111");

//   // The actual height is calculated from the same bilingual string so both
//   // languages remain in the flow before the schedule starts.
//   const height = doc.heightOfString(english, { width, lineGap: 1.5 });
//   drawMixedText(doc, text, x, y, { width, lineGap: 1.5 });
//   return height + 15;
// };

// export const createL1AcknowledgementSlip = async ({
//   student,
//   exam,
//   district,
//   block,
//   school,
//   res = null,
//   download = false,
// }) => {
//   const fonts = getFontPaths();

//   if (!fs.existsSync(fonts.latin) || !fs.existsSync(fonts.devanagari) || !fs.existsSync(fonts.devanagariBold)) {
//     throw new Error("Required PDF fonts are missing from backend/public/fonts");
//   }

//   const doc = new PDFDocument({ size: "A4", margin: 32 });
//   const photoBuffer = await loadStudentPhoto(student);

//   let target = res;
//   let chunks = null;

//   if (!target) {
//     chunks = [];
//     target = new Writable({
//       write(chunk, _encoding, callback) {
//         chunks.push(Buffer.from(chunk));
//         callback();
//       },
//     });
//   } else {
//     target.setHeader("Content-Type", "application/pdf");
//     target.setHeader(
//       "Content-Disposition",
//       `${download ? "attachment" : "inline"}; filename="${student.slipId}-acknowledgement.pdf"`
//     );
//     target.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//     target.setHeader("Pragma", "no-cache");
//     target.setHeader("Expires", "0");
//   }

//   doc.pipe(target);
//   doc.registerFont("NotoSans-Regular", fonts.latin);
//   doc.registerFont("NotoSansDevanagari-Regular", fonts.devanagari);
//   doc.registerFont("NotoSansDevanagari-Bold", fonts.devanagariBold);

//   const pageWidth = doc.page.width;
//   const left = 42;
//   const right = pageWidth - 42;
//   const contentWidth = right - left;

//   const branding = path.resolve(process.cwd(), "public/branding");
//   const haryanaLogo = path.join(branding, "haryana.png");
//   const buniyaadLogo = path.join(branding, "Buniyaad.png");

//   if (fs.existsSync(haryanaLogo)) {
//     doc.image(haryanaLogo, left, 28, { fit: [45, 58], align: "center", valign: "center" });
//   }
//   if (fs.existsSync(buniyaadLogo)) {
//     doc.image(buniyaadLogo, right - 48, 28, { fit: [48, 58], align: "center", valign: "center" });
//   }

//   // Header: English + Hindi remain available without replacing either language.
//   doc.fillColor("#2d7134").fontSize(11.5);
//   drawMixedText(doc, "Directorate of School Education (DSE) Shiksha Sadan, Haryana", left + 48, 31, {
//     width: contentWidth - 96,
//     align: "center",
//   });

//   doc.fontSize(13.5);
//   drawMixedText(
//     doc,
//     exam.code === "MB" ? "Mission Buniyaad Level 1 Registration Slip (2027-29)" : "Haryana Super 100",
//     left + 48,
//     49,
//     { width: contentWidth - 96, align: "center" }
//   );

//   const status = student.verificationStatus || (student.isVerified ? "Verified" : "Pending");
//   const statusColor = status === "Verified" ? "#188038" : "#d93025";

//   doc.fontSize(8).fillColor(statusColor);
//   drawMixedText(doc, `Registration Status: ${status}`, left + 48, 68, {
//     width: contentWidth - 96,
//     align: "center",
//     bold: true,
//   });

//   doc.fillColor("#111").fontSize(7.5);
//   drawMixedText(doc, "E – ACKNOWLEDGEMENNT SLIP", left + 48, 81, {
//     width: contentWidth - 96,
//     align: "center",
//   });

//   // doc.fontSize(7);
//   // drawMixedText(doc, "Examination Date: 30th January", left + 48, 93, {
//   //   width: contentWidth - 96,
//   //   align: "center",
//   // });
//   // drawMixedText(doc, "Reporting Time: 10:30 AM, Exam Time: 11:30 AM", left + 48, 104, {
//   //   width: contentWidth - 96,
//   //   align: "center",
//   // });

//   // Student information table + photo.
//   const tableTop = 126;
//   const labelW = 143;
//   const valueW = 205;
//   const photoX = left + labelW + valueW + 18;
//   const photoW = right - photoX;
//   const rowH = 18.5;

//   const rows = [
//     ["Student Name", student.name],
//     ["Father's Name", student.fatherName],
//     ["Date of Birth", student.dob ? new Date(student.dob).toLocaleDateString("en-IN") : "-"],
//     ["Category", student.category],
//     ["SRN Number", student.studentSrn],
//     ["Aadhar Number", student.aadhar],
//     ["Mobile Number", student.mobile],
//     ["District", district ? `${safeText(district.districtName)}${district.districtId ? ` (${district.districtId})` : ""}` : "-"],
//     ["Block", block ? `${safeText(block.blockName)}${block.blockId ? ` (${block.blockId})` : ""}` : "-"],
//     ["School", school?.schoolName || student.schoolNameManual],
//   ];

//   rows.forEach(([label, value], index) => {
//     const y = tableTop + index * rowH;
//     drawCell(doc, left, y, labelW, rowH, label, { bold: true });
//     drawCell(doc, left + labelW, y, valueW, rowH, value);
//   });

//   const photoH = rows.length * rowH;
//   doc.rect(photoX, tableTop, photoW, photoH).stroke();
//   if (photoBuffer) {
//     try {
//       doc.image(photoBuffer, photoX + 7, tableTop + 7, {
//         fit: [photoW - 14, photoH - 14],
//         align: "center",
//         valign: "center",
//       });
//     } catch {
//       doc.font("NotoSans-Regular").fontSize(9).fillColor("#222").text(
//         "Student Photo",
//         photoX + 8,
//         tableTop + photoH / 2 - 6,
//         { width: photoW - 16, align: "center" }
//       );
//     }
//   } else {
//     doc.font("NotoSans-Regular").fontSize(9).fillColor("#222").text(
//       "Student Photo",
//       photoX + 8,
//       tableTop + photoH / 2 - 6,
//       { width: photoW - 16, align: "center" }
//     );
//   }

//   let y = tableTop + photoH + 24;
//   doc.fontSize(8.5).fillColor("#111");
//   drawMixedText(doc, "General Instructions / सामान्य निर्देश", left, y, {
//     width: contentWidth,
//     bold: true,
//   });
//   y += 16;

//   y += drawBilingualInstruction(
//     doc,
//     1,
//     "Use your SRN number or Slip ID to check registration status and download admit card.",
//     "पंजीकरण की स्थिति जानने और प्रवेश पत्र डाउनलोड करने के लिए अपने SRN या स्लिप आईडी का उपयोग करें।",
//     left + 2,
//     y,
//     contentWidth - 4
//   );
//   y += drawBilingualInstruction(
//     doc,
//     2,
//     "Check your registration status after 3 days. If accepted, your registration status will be updated.",
//     "3 दिनों के बाद अपनी पंजीकरण स्थिति जांचें। स्वीकृत होने पर आपकी स्थिति अपडेट कर दी जाएगी।",
//     left + 2,
//     y,
//     contentWidth - 4
//   );
//   y += drawBilingualInstruction(
//     doc,
//     3,
//     "Submission of wrong details can lead to rejection of registration form.",
//     "गलत जानकारी देने पर पंजीकरण फॉर्म अस्वीकार किया जा सकता है।",
//     left + 2,
//     y,
//     contentWidth - 4
//   );

//   y += 5;
//   doc.fontSize(8);
//   drawMixedText(
//     doc,
//     exam.code === "MB" ? "Mission Buniyaad Schedule" : "Haryana Super 100 Schedule",
//     left,
//     y,
//     { width: contentWidth, align: "center", bold: true }
//   );
//   y += 14;

//   const schedule = [
//     ["Registration Opens", "12th November 2025"],
//     ["Registration Closes", "16th December 2025"],
//     ["Entrance Exam Level - 1 Admit Card Download", "17th December 2025"],
//     ["Entrance Exam Level - 1", "24th December 2025"],
//     ["Entrance Exam Level - 1 Result", "20th January 2026"],
//     ["Entrance Exam Level - 2 Admit Card Download", "20th January 2026"],
//     ["Entrance Exam Level - 2", "30th January 2026"],
//     ["Entrance Exam Level - 2 Result", "25th February 2026"],
//   ];

//   const mid = left + 280;
//   const scheduleRowH = 15;
//   schedule.forEach(([label, date], index) => {
//     const sy = y + index * scheduleRowH;
//     drawCell(doc, left, sy, mid - left, scheduleRowH, label);
//     drawCell(doc, mid, sy, right - mid, scheduleRowH, date);
//   });
//   y += schedule.length * scheduleRowH + 18;

//   doc.fontSize(7);
//   drawMixedText(
//     doc,
//     "Helpline Number (संपर्क करने के समय सुबह 09 बजे से शाम 05 बजे तक): 7982109504, 7982109215, 7982108494",
//     left,
//     y,
//     { width: contentWidth, align: "center", bold: true }
//   );
//   y += 15;

//   drawMixedText(
//     doc,
//     '"PRATIBHA KHOJ" AN INITIATIVE BY HARYANA EDUCATION DEPARTMENT',
//     left,
//     y,
//     { width: contentWidth, align: "center", bold: true }
//   );
//   y += 16;

//   const finalNote = "Note: Your form is currently under review. Once verified, Registration Status will be Verified. Filling wrong information may lead to rejection of the form. (नोट: आपका फॉर्म जांच के अधीन है। सत्यापन के बाद पंजीकरण स्थिति Verified होगी। गलत जानकारी देने पर फॉर्म अस्वीकार किया जा सकता है।)";
//   const noteWidth = contentWidth - 12;
//   const noteHeight = Math.max(42, doc.heightOfString(finalNote, { width: noteWidth, lineGap: 1.5 }) + 12);
//   y += 8;

//   // Keep the final note inside the page and give it its own block so it never
//   // overlaps the helpline/initiative text when font metrics wrap the Hindi line.
//   if (y + noteHeight > doc.page.height - 28) {
//     doc.addPage();
//     y = 42;
//   }

//   doc.roundedRect(left, y - 4, contentWidth, noteHeight, 4).stroke("#d9dfe9");
//   doc.fontSize(6.7).fillColor("#222");
//   drawMixedText(doc, finalNote, left + 6, y + 2, {
//     width: noteWidth, align: "center", lineGap: 1.5
//   });

//   doc.end();

//   if (!res) {
//     await new Promise((resolve, reject) => {
//       target.once("finish", resolve);
//       target.once("error", reject);
//     });
//     return Buffer.concat(chunks);
//   }
// };







import fs from "fs";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getSignedUrlForSpacesKey } from "../../utils/space.utils.js";

/* =========================================================
   HELPERS
========================================================= */

const safeText = (value, fallback = "-") => {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value).trim();
};

const getTemplatePath = () =>
  path.resolve(
    process.cwd(),
    "public/template/l1-ack-slip.pdf"
  );

const getDevanagariFontPath = () =>
  path.resolve(
    process.cwd(),
    "public/fonts/NotoSansDevanagari-Regular.ttf"
  );

const getDevanagariBoldFontPath = () =>
  path.resolve(
    process.cwd(),
    "public/fonts/NotoSansDevanagari-Bold.ttf"
  );

const formatDate = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return safeText(value);
  }

  return date.toLocaleDateString("en-IN");
};

const getStatus = (student) => {
  if (student?.verificationStatus) {
    return student.verificationStatus;
  }

  return student?.isVerified
    ? "Verified"
    : "Pending";
};

/* =========================================================
   STUDENT PHOTO
========================================================= */

const getStudentPhoto = async (student) => {
  const key =
    student?.studentImage?.key ||
    student?.studentimage?.key ||
    student?.image?.key ||
    student?.imageUrl?.key;

  if (!key) {
    return null;
  }

  try {
    const signedUrl =
      await getSignedUrlForSpacesKey(
        key,
        600
      );

    const response =
      await fetch(signedUrl);

    if (!response.ok) {
      return null;
    }

    return Buffer.from(
      await response.arrayBuffer()
    );
  } catch (error) {
    console.error(
      "Student photo load failed:",
      error
    );

    return null;
  }
};

/* =========================================================
   EMBED PHOTO
========================================================= */

const embedImage = async (
  pdfDoc,
  buffer
) => {
  if (!buffer) {
    return null;
  }

  try {
    return await pdfDoc.embedJpg(
      buffer
    );
  } catch (_) {}

  try {
    return await pdfDoc.embedPng(
      buffer
    );
  } catch (_) {}

  return null;
};

/* =========================================================
   CENTER TEXT
========================================================= */

const drawCenteredText = (
  page,
  text,
  {
    x,
    y,
    width,
    size,
    font,
    color,
  }
) => {
  const value = safeText(
    text,
    ""
  );

  if (!value) return;

  const textWidth =
    font.widthOfTextAtSize(
      value,
      size
    );

  page.drawText(value, {
    x:
      x +
      (width - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
};

/* =========================================================
   TABLE CELL
========================================================= */

const drawTableCell = (
  page,
  {
    x,
    y,
    width,
    height,
    text,
    font,
    fontSize = 7.2,
  }
) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 1,
    borderColor: rgb(
      0,
      0,
      0
    ),
  });

  const value = safeText(text);

  let size = fontSize;

  const availableWidth =
    width - 8;

  let textWidth =
    font.widthOfTextAtSize(
      value,
      size
    );

  while (
    textWidth >
      availableWidth &&
    size > 5.5
  ) {
    size -= 0.25;

    textWidth =
      font.widthOfTextAtSize(
        value,
        size
      );
  }

  page.drawText(value, {
    x: x + 4,
    y:
      y +
      (height - size) /
        2 +
      1,
    size,
    font,
    color: rgb(
      0,
      0,
      0
    ),
  });
};

/* =========================================================
   MAIN FUNCTION
========================================================= */

export const createL1AcknowledgementSlip =
  async ({
    student,
    exam,
    district,
    block,
    school,
    res = null,
    download = false,
  }) => {
    /* -----------------------------------------------------
       LOAD STATIC TEMPLATE
    ----------------------------------------------------- */

    const templatePath =
      getTemplatePath();

    if (
      !fs.existsSync(
        templatePath
      )
    ) {
      throw new Error(
        `Template not found: ${templatePath}`
      );
    }

    const templateBytes =
      fs.readFileSync(
        templatePath
      );

    const pdfDoc =
      await PDFDocument.load(
        templateBytes
      );

    pdfDoc.registerFontkit(
      fontkit
    );

    const page =
      pdfDoc.getPages()[0];

    const {
      width: pageWidth,
      height: pageHeight,
    } = page.getSize();

    /* -----------------------------------------------------
       FONTS
    ----------------------------------------------------- */

    const regularFont =
      await pdfDoc.embedFont(
        StandardFonts.Helvetica
      );

    const boldFont =
      await pdfDoc.embedFont(
        StandardFonts.HelveticaBold
      );

    let hindiFont =
      regularFont;

    let hindiBoldFont =
      boldFont;

    const hindiFontPath =
      getDevanagariFontPath();

    const hindiBoldFontPath =
      getDevanagariBoldFontPath();

    if (
      fs.existsSync(
        hindiFontPath
      )
    ) {
      hindiFont =
        await pdfDoc.embedFont(
          fs.readFileSync(
            hindiFontPath
          )
        );
    }

    if (
      fs.existsSync(
        hindiBoldFontPath
      )
    ) {
      hindiBoldFont =
        await pdfDoc.embedFont(
          fs.readFileSync(
            hindiBoldFontPath
          )
        );
    }

    /* -----------------------------------------------------
       COLORS
    ----------------------------------------------------- */

    const green =
      rgb(
        0.10,
        0.40,
        0.18
      );

    const red =
      rgb(
        0.80,
        0.12,
        0.10
      );

    const black =
      rgb(
        0,
        0,
        0
      );

    /* -----------------------------------------------------
       TOP HEADER
    ----------------------------------------------------- */

    const headerX = 110;

    const headerWidth =
      pageWidth - 220;

    /*
     * Main heading
     */
    drawCenteredText(
      page,
      "Directorate of School Education (DSE) Shiksha Sadan, Haryana",
      {
        x: headerX,
        y: pageHeight - 43,
        width: headerWidth,
        size: 10.5,
        font: regularFont,
        color: green,
      }
    );

    const examCode =
      String(
        exam?.code ||
          exam?.examCode ||
          exam?.type ||
          ""
      ).toUpperCase();

    const title =
      examCode.includes("100") ||
      examCode.includes("HS")
        ? "Haryana Super 100 Level 1 Registration Slip (2027-29)"
        : "Mission Buniyaad Level 1 Registration Slip (2027-29)";

    drawCenteredText(
      page,
      title,
      {
        x: headerX,
        y: pageHeight - 61,
        width: headerWidth,
        size: 12.5,
        font: regularFont,
        color: green,
      }
    );

    /* -----------------------------------------------------
       REGISTRATION STATUS
    ----------------------------------------------------- */

    const status =
      getStatus(student);

    /*
     * Bigger status font
     */
    drawCenteredText(
      page,
      `Registration Status: ${status}`,
      {
        x: headerX,
        y: pageHeight - 78,
        width: headerWidth,
        size: 9,
        font: boldFont,
        color:
          status === "Verified"
            ? rgb(
                0.05,
                0.48,
                0.15
              )
            : red,
      }
    );

    /* -----------------------------------------------------
       REGISTRATION REMARK
    ----------------------------------------------------- */

    const registrationRemark =
      safeText(
        student?.registrationFormVerificationRemark,
        ""
      );

    /*
     * Remark sirf tab show hoga jab available ho.
     *
     * Example:
     * Registration Remark: Inappropriate Image
     */

    if (registrationRemark) {
      drawCenteredText(
        page,
        `Registration Remark: ${registrationRemark}`,
        {
          x: headerX,
          y: pageHeight - 91,
          width: headerWidth,
          size: 7.2,
          font: regularFont,
          color: red,
        }
      );

      drawCenteredText(
        page,
        "E – ACKNOWLEDGEMENT SLIP",
        {
          x: headerX,
          y: pageHeight - 103,
          width: headerWidth,
          size: 7,
          font: regularFont,
          color: black,
        }
      );
    } else {
      drawCenteredText(
        page,
        "E – ACKNOWLEDGEMENT SLIP",
        {
          x: headerX,
          y: pageHeight - 91,
          width: headerWidth,
          size: 7,
          font: regularFont,
          color: black,
        }
      );
    }

    /* -----------------------------------------------------
       STUDENT DATA
    ----------------------------------------------------- */

    const studentName =
      student?.name;

    const fatherName =
      student?.fatherName;

    const dob =
      formatDate(
        student?.dob
      );

    const category =
      student?.category;

    const srn =
      student?.studentSrn ||
      student?.srn;

    const aadhaar =
      student?.aadhar ||
      student?.aadhaar ||
      student?.aadhaarNumber;

    const mobile =
      student?.mobile ||
      student?.personalContact ||
      student?.parentContact;

    const districtText =
      district
        ? `${safeText(
            district.districtName
          )}${
            district.districtId
              ? ` (${district.districtId})`
              : ""
          }`
        : safeText(
            student?.districtName
          );

    const blockText =
      block
        ? `${safeText(
            block.blockName
          )}${
            block.blockId
              ? ` (${block.blockId})`
              : ""
          }`
        : safeText(
            student?.blockName
          );

    const schoolText =
      school?.schoolName ||
      student?.schoolNameManual ||
      student?.schoolName;

    const rows = [
  [
    "Student Name",
    studentName,
  ],
  [
    "Father's Name",
    fatherName,
  ],
  [
    "Date of Birth",
    dob,
  ],
  [
    "Category",
    category,
  ],
  [
    "SRN Number",
    srn,
  ],
  [
    "SlipId",
    student?.slipId,
  ],
  [
    "Aadhar Number",
    aadhaar,
  ],
  [
    "Mobile Number",
    mobile,
  ],
  [
    "District",
    districtText,
  ],
  [
    "Block",
    blockText,
  ],
  [
    "School",
    schoolText,
  ],
];

    /* -----------------------------------------------------
       STUDENT TABLE
       
       Table ko thoda neeche shift kiya gaya hai.
    ----------------------------------------------------- */

    const tableX = 28;

    /*
     * OLD:
     * pageHeight - 108
     *
     * NEW:
     * pageHeight - 122
     *
     * Isse table approx 14 points neeche aa jayegi.
     */

    const tableTop =
      pageHeight - 122;

    const labelWidth =
      145;

    const tableWidth =
      320;

    const valueWidth =
      tableWidth -
      labelWidth;

    const rowHeight =
      18;

    rows.forEach(
      ([label, value], index) => {
        const y =
          tableTop -
          (index + 1) *
            rowHeight;

        drawTableCell(
          page,
          {
            x: tableX,
            y,
            width:
              labelWidth,
            height:
              rowHeight,
            text: label,
            font:
              boldFont,
          }
        );

        drawTableCell(
          page,
          {
            x:
              tableX +
              labelWidth,
            y,
            width:
              valueWidth,
            height:
              rowHeight,
            text: value,
            font:
              regularFont,
          }
        );
      }
    );

    const tableHeight =
      rows.length *
      rowHeight;

    const tableBottom =
      tableTop -
      tableHeight;

    /* -----------------------------------------------------
       PHOTO BOX
    ----------------------------------------------------- */

    const photoX =
      tableX +
      tableWidth +
      18;

    const photoWidth =
      pageWidth -
      photoX -
      30;

    const photoHeight =
      tableHeight;

    /*
     * Empty box ALWAYS visible.
     */

    page.drawRectangle({
      x: photoX,
      y: tableBottom,
      width: photoWidth,
      height: photoHeight,
      borderWidth: 1,
      borderColor: black,
    });

    /* -----------------------------------------------------
       STUDENT PHOTO
    ----------------------------------------------------- */

    const photoBuffer =
      await getStudentPhoto(
        student
      );

    if (photoBuffer) {
      const image =
        await embedImage(
          pdfDoc,
          photoBuffer
        );

      if (image) {
        const padding = 7;

        const availableWidth =
          photoWidth -
          padding * 2;

        const availableHeight =
          photoHeight -
          padding * 2;

        const scale =
          Math.min(
            availableWidth /
              image.width,
            availableHeight /
              image.height
          );

        const imageWidth =
          image.width *
          scale;

        const imageHeight =
          image.height *
          scale;

        page.drawImage(
          image,
          {
            x:
              photoX +
              (
                photoWidth -
                imageWidth
              ) /
                2,

            y:
              tableBottom +
              (
                photoHeight -
                imageHeight
              ) /
                2,

            width:
              imageWidth,

            height:
              imageHeight,
          }
        );
      }
    }

    /* -----------------------------------------------------
       SAVE
       
       Template ka existing content untouched rahega.
    ----------------------------------------------------- */

    const pdfBytes =
      await pdfDoc.save();

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    if (res) {
      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `${
          download
            ? "attachment"
            : "inline"
        }; filename="l1-acknowledgement-${safeText(
          srn,
          "student"
        )}.pdf"`
      );

      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );

      res.setHeader(
        "Pragma",
        "no-cache"
      );

      res.setHeader(
        "Expires",
        "0"
      );

      return res.end(
        Buffer.from(
          pdfBytes
        )
      );
    }

    return Buffer.from(
      pdfBytes
    );
  };