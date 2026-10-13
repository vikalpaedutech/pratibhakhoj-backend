

// import fs from "fs";
// import path from "path";
// import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
// import fontkit from "@pdf-lib/fontkit";
// import { getSignedUrlForSpacesKey } from "../../utils/space.utils.js";

// /* =========================================================
//    HELPERS
// ========================================================= */

// const safeText = (value, fallback = "-") => {
//   if (
//     value === undefined ||
//     value === null ||
//     String(value).trim() === ""
//   ) {
//     return fallback;
//   }

//   return String(value).trim();
// };

// const getTemplatePath = () =>
//   path.resolve(
//     process.cwd(),
//     "public/template/l1-ack-slip.pdf"
//   );

// const getDevanagariFontPath = () =>
//   path.resolve(
//     process.cwd(),
//     "public/fonts/NotoSansDevanagari-Regular.ttf"
//   );

// const getDevanagariBoldFontPath = () =>
//   path.resolve(
//     process.cwd(),
//     "public/fonts/NotoSansDevanagari-Bold.ttf"
//   );

// const formatDate = (value) => {
//   if (!value) return "-";

//   const date = new Date(value);

//   if (Number.isNaN(date.getTime())) {
//     return safeText(value);
//   }

//   return date.toLocaleDateString("en-IN");
// };

// const getStatus = (student) => {
//   if (student?.verificationStatus) {
//     return student.verificationStatus;
//   }

//   return student?.isVerified
//     ? "Verified"
//     : "Pending";
// };

// /* =========================================================
//    STUDENT PHOTO
// ========================================================= */

// const getStudentPhoto = async (student) => {
//   const key =
//     student?.studentImage?.key ||
//     student?.studentimage?.key ||
//     student?.image?.key ||
//     student?.imageUrl?.key;

//   if (!key) {
//     return null;
//   }

//   try {
//     const signedUrl =
//       await getSignedUrlForSpacesKey(
//         key,
//         600
//       );

//     const response =
//       await fetch(signedUrl);

//     if (!response.ok) {
//       return null;
//     }

//     return Buffer.from(
//       await response.arrayBuffer()
//     );
//   } catch (error) {
//     console.error(
//       "Student photo load failed:",
//       error
//     );

//     return null;
//   }
// };

// /* =========================================================
//    EMBED PHOTO
// ========================================================= */

// const embedImage = async (
//   pdfDoc,
//   buffer
// ) => {
//   if (!buffer) {
//     return null;
//   }

//   try {
//     return await pdfDoc.embedJpg(
//       buffer
//     );
//   } catch (_) {}

//   try {
//     return await pdfDoc.embedPng(
//       buffer
//     );
//   } catch (_) {}

//   return null;
// };

// /* =========================================================
//    CENTER TEXT
// ========================================================= */

// const drawCenteredText = (
//   page,
//   text,
//   {
//     x,
//     y,
//     width,
//     size,
//     font,
//     color,
//   }
// ) => {
//   const value = safeText(
//     text,
//     ""
//   );

//   if (!value) return;

//   const textWidth =
//     font.widthOfTextAtSize(
//       value,
//       size
//     );

//   page.drawText(value, {
//     x:
//       x +
//       (width - textWidth) / 2,
//     y,
//     size,
//     font,
//     color,
//   });
// };

// /* =========================================================
//    TABLE TEXT WRAPPING
// ========================================================= */

// const wrapText = (
//   text,
//   font,
//   fontSize,
//   maxWidth
// ) => {
//   const value = safeText(
//     text,
//     ""
//   );

//   if (!value) {
//     return [""];
//   }

//   const words =
//     value.split(/\s+/);

//   const lines = [];

//   let currentLine = "";

//   const pushLongWord = (word) => {
//     let chunk = "";

//     for (const char of word) {
//       const candidate =
//         chunk + char;

//       if (
//         font.widthOfTextAtSize(
//           candidate,
//           fontSize
//         ) <= maxWidth ||
//         !chunk
//       ) {
//         chunk = candidate;
//       } else {
//         lines.push(chunk);
//         chunk = char;
//       }
//     }

//     if (chunk) {
//       lines.push(chunk);
//     }
//   };

//   for (const word of words) {
//     const candidate =
//       currentLine
//         ? `${currentLine} ${word}`
//         : word;

//     if (
//       font.widthOfTextAtSize(
//         candidate,
//         fontSize
//       ) <= maxWidth
//     ) {
//       currentLine =
//         candidate;

//       continue;
//     }

//     if (currentLine) {
//       lines.push(
//         currentLine
//       );

//       currentLine = "";
//     }

//     if (
//       font.widthOfTextAtSize(
//         word,
//         fontSize
//       ) <= maxWidth
//     ) {
//       currentLine = word;
//     } else {
//       pushLongWord(word);
//     }
//   }

//   if (currentLine) {
//     lines.push(
//       currentLine
//     );
//   }

//   return lines.length
//     ? lines
//     : [""];
// };

// const getWrappedCellLines = (
//   text,
//   font,
//   fontSize,
//   width
// ) => {
//   return wrapText(
//     text,
//     font,
//     fontSize,
//     width - 8
//   );
// };

// /* =========================================================
//    TABLE ROW HEIGHT
// ========================================================= */

// const getTableRowHeight = ({
//   label,
//   value,
//   labelFont,
//   valueFont,
//   fontSize = 7.8,
//   baseHeight = 18,
//   labelWidth,
//   valueWidth,
// }) => {
//   const labelLines =
//     getWrappedCellLines(
//       label,
//       labelFont,
//       fontSize,
//       labelWidth
//     );

//   const valueLines =
//     getWrappedCellLines(
//       value,
//       valueFont,
//       fontSize,
//       valueWidth
//     );

//   const lineHeight =
//     fontSize + 1.5;

//   const lineCount =
//     Math.max(
//       labelLines.length,
//       valueLines.length
//     );

//   return Math.max(
//     baseHeight,
//     lineCount *
//       lineHeight +
//       2 * 3
//   );
// };

// /* =========================================================
//    TABLE CELL
// ========================================================= */

// const drawTableCell = (
//   page,
//   {
//     x,
//     y,
//     width,
//     height,
//     text,
//     font,
//     fontSize = 7.8,
//     verticalAlign = "middle",
//   }
// ) => {
//   page.drawRectangle({
//     x,
//     y,
//     width,
//     height,
//     borderWidth: 1,
//     borderColor:
//       rgb(
//         0,
//         0,
//         0
//       ),
//   });

//   const value =
//     safeText(
//       text,
//       ""
//     );

//   const paddingX = 4;
//   const paddingY = 3;

//   const lineHeight =
//     fontSize + 1.5;

//   const lines =
//     getWrappedCellLines(
//       value,
//       font,
//       fontSize,
//       width
//     );

//   const contentHeight =
//     lines.length *
//     lineHeight;

//   let startY;

//   if (
//     verticalAlign ===
//     "top"
//   ) {
//     startY =
//       y +
//       height -
//       paddingY -
//       fontSize;
//   } else {
//     startY =
//       y +
//       (
//         height -
//         contentHeight
//       ) /
//         2 +
//       lineHeight -
//       fontSize;
//   }

//   lines.forEach(
//     (line, index) => {
//       page.drawText(
//         line,
//         {
//           x:
//             x +
//             paddingX,

//           y:
//             startY -
//             index *
//               lineHeight,

//           size:
//             fontSize,

//           font,

//           color:
//             rgb(
//               0,
//               0,
//               0
//             ),
//         }
//       );
//     }
//   );
// };

// /* =========================================================
//    MAIN FUNCTION
// ========================================================= */

// export const createL1AcknowledgementSlip =
//   async ({
//     student,
//     exam,
//     district,
//     block,
//     school,
//     res = null,
//     download = false,
//   }) => {

//     /* -----------------------------------------------------
//        LOAD STATIC TEMPLATE
//     ----------------------------------------------------- */

//     const templatePath =
//       getTemplatePath();

//     if (
//       !fs.existsSync(
//         templatePath
//       )
//     ) {
//       throw new Error(
//         `Template not found: ${templatePath}`
//       );
//     }

//     const templateBytes =
//       fs.readFileSync(
//         templatePath
//       );

//     const pdfDoc =
//       await PDFDocument.load(
//         templateBytes
//       );

//     pdfDoc.registerFontkit(
//       fontkit
//     );

//     const page =
//       pdfDoc.getPages()[0];

//     const {
//       width: pageWidth,
//       height: pageHeight,
//     } = page.getSize();

//     /* -----------------------------------------------------
//        FONTS
//     ----------------------------------------------------- */

//     const regularFont =
//       await pdfDoc.embedFont(
//         StandardFonts.Helvetica
//       );

//     const boldFont =
//       await pdfDoc.embedFont(
//         StandardFonts.HelveticaBold
//       );

//     let hindiFont =
//       regularFont;

//     let hindiBoldFont =
//       boldFont;

//     const hindiFontPath =
//       getDevanagariFontPath();

//     const hindiBoldFontPath =
//       getDevanagariBoldFontPath();

//     if (
//       fs.existsSync(
//         hindiFontPath
//       )
//     ) {
//       hindiFont =
//         await pdfDoc.embedFont(
//           fs.readFileSync(
//             hindiFontPath
//           )
//         );
//     }

//     if (
//       fs.existsSync(
//         hindiBoldFontPath
//       )
//     ) {
//       hindiBoldFont =
//         await pdfDoc.embedFont(
//           fs.readFileSync(
//             hindiBoldFontPath
//           )
//         );
//     }

//     /* -----------------------------------------------------
//        COLORS
//     ----------------------------------------------------- */

//     const green =
//       rgb(
//         0.10,
//         0.40,
//         0.18
//       );

//     const red =
//       rgb(
//         0.80,
//         0.12,
//         0.10
//       );

//     const black =
//       rgb(
//         0,
//         0,
//         0
//       );

//     /* -----------------------------------------------------
//        TOP HEADER
//     ----------------------------------------------------- */

//     const headerX = 110;

//     const headerWidth =
//       pageWidth - 220;

//     drawCenteredText(
//       page,
//       "Directorate of School Education (DSE) Shiksha Sadan, Haryana",
//       {
//         x:
//           headerX,

//         y:
//           pageHeight - 43,

//         width:
//           headerWidth,

//         size:
//           10.5,

//         font:
//           regularFont,

//         color:
//           green,
//       }
//     );

//     const examCode =
//       String(
//         exam?.code ||
//         exam?.examCode ||
//         exam?.type ||
//         ""
//       ).toUpperCase();

//     const title =
//       examCode.includes("100") ||
//       examCode.includes("HS")
//         ? "Haryana Super 100 Level 1 Registration Slip (2027-29)"
//         : "Mission Buniyaad Level 1 Registration Slip (2027-29)";

//     drawCenteredText(
//       page,
//       title,
//       {
//         x:
//           headerX,

//         y:
//           pageHeight - 61,

//         width:
//           headerWidth,

//         size:
//           12.5,

//         font:
//           regularFont,

//         color:
//           green,
//       }
//     );

//     /* -----------------------------------------------------
//        REGISTRATION STATUS
//     ----------------------------------------------------- */

//     const status =
//       getStatus(
//         student
//       );

//     drawCenteredText(
//       page,
//       `Registration Status: ${status}`,
//       {
//         x:
//           headerX,

//         y:
//           pageHeight - 78,

//         width:
//           headerWidth,

//         size:
//           9,

//         font:
//           boldFont,

//         color:
//           status ===
//           "Verified"
//             ? rgb(
//                 0.05,
//                 0.48,
//                 0.15
//               )
//             : red,
//       }
//     );

//     /* -----------------------------------------------------
//        REGISTRATION REMARK
//     ----------------------------------------------------- */

//     const registrationRemark =
//       safeText(
//         student?.registrationFormVerificationRemark,
//         ""
//       );

//     if (
//       registrationRemark
//     ) {
//       drawCenteredText(
//         page,
//         `Registration Remark: ${registrationRemark}`,
//         {
//           x:
//             headerX,

//           y:
//             pageHeight - 91,

//           width:
//             headerWidth,

//           size:
//             7.2,

//           font:
//             regularFont,

//           color:
//             red,
//         }
//       );

//       drawCenteredText(
//         page,
//         "E – ACKNOWLEDGEMENT SLIP",
//         {
//           x:
//             headerX,

//           y:
//             pageHeight - 103,

//           width:
//             headerWidth,

//           size:
//             7,

//           font:
//             regularFont,

//           color:
//             black,
//         }
//       );
//     } else {
//       drawCenteredText(
//         page,
//         "E – ACKNOWLEDGEMENT SLIP",
//         {
//           x:
//             headerX,

//           y:
//             pageHeight - 91,

//           width:
//             headerWidth,

//           size:
//             7,

//           font:
//             regularFont,

//           color:
//             black,
//         }
//       );
//     }

//     /* -----------------------------------------------------
//        STUDENT DATA
//     ----------------------------------------------------- */

//     const studentName =
//       student?.name;

//     const fatherName =
//       student?.fatherName;

//     const dob =
//       formatDate(
//         student?.dob
//       );

//     const category =
//       student?.category;

//     const srn =
//       student?.studentSrn ||
//       student?.srn;

//     const aadhaar =
//       student?.aadhar ||
//       student?.aadhaar ||
//       student?.aadhaarNumber;

//     const mobile =
//       student?.mobile ||
//       student?.personalContact ||
//       student?.parentContact;

//     const districtText =
//       district
//         ? `${safeText(
//             district.districtName
//           )}${
//             district.districtId
//               ? ` (${district.districtId})`
//               : ""
//           }`
//         : safeText(
//             student?.districtName
//           );

//     const blockText =
//       block
//         ? `${safeText(
//             block.blockName
//           )}${
//             block.blockId
//               ? ` (${block.blockId})`
//               : ""
//           }`
//         : safeText(
//             student?.blockName
//           );

//     const schoolText =
//       school?.schoolName ||
//       student?.schoolNameManual ||
//       student?.schoolName;

//     const rows = [
//       [
//         "Student Name",
//         studentName,
//       ],
//       [
//         "Father Name",
//         fatherName,
//       ],
//       [
//         "Date of Birth",
//         dob,
//       ],
//       [
//         "Category",
//         category,
//       ],
//       [
//         "SRN Number",
//         srn,
//       ],
//       [
//         "Slip-Id",
//         student?.slipId,
//       ],
//       [
//         "Aadhar Number",
//         aadhaar,
//       ],
//       [
//         "Mobile Number",
//         mobile,
//       ],
//       [
//         "District",
//         districtText,
//       ],
//       [
//         "Block",
//         blockText,
//       ],
//       [
//         "School",
//         schoolText,
//       ],
//     ];

//     /* -----------------------------------------------------
//        STUDENT TABLE
//     ----------------------------------------------------- */

//     const tableX = 48;

//     const tableTop =
//       pageHeight - 122;

//     /*
//       Changed:
//       Label column reduced so value column becomes wider.
//     */
//     const labelWidth =
//       130;

//     const tableWidth =
//       320;

//     const valueWidth =
//       tableWidth -
//       labelWidth;

//     const rowBaseHeight =
//       18;

//     /*
//       Changed:
//       Slightly larger table font.
//     */
//     const cellFontSize =
//       7.8;

//     const rowHeights =
//       rows.map(
//         ([label, value]) =>
//           getTableRowHeight({
//             label,
//             value,

//             labelFont:
//               boldFont,

//             valueFont:
//               regularFont,

//             fontSize:
//               cellFontSize,

//             baseHeight:
//               rowBaseHeight,

//             labelWidth,

//             valueWidth,
//           })
//       );

//     let currentTableTop =
//       tableTop;

//     rows.forEach(
//       ([label, value], index) => {
//         const currentRowHeight =
//           rowHeights[
//             index
//           ];

//         const y =
//           currentTableTop -
//           currentRowHeight;

//         drawTableCell(
//           page,
//           {
//             x:
//               tableX,

//             y,

//             width:
//               labelWidth,

//             height:
//               currentRowHeight,

//             text:
//               label,

//             font:
//               boldFont,

//             fontSize:
//               cellFontSize,
//           }
//         );

//         drawTableCell(
//           page,
//           {
//             x:
//               tableX +
//               labelWidth,

//             y,

//             width:
//               valueWidth,

//             height:
//               currentRowHeight,

//             text:
//               value,

//             font:
//               regularFont,

//             fontSize:
//               cellFontSize,
//           }
//         );

//         currentTableTop =
//           y;
//       }
//     );

//     const tableHeight =
//       rowHeights.reduce(
//         (
//           total,
//           height
//         ) =>
//           total + height,
//         0
//       );

//     const tableBottom =
//       tableTop -
//       tableHeight;

//     /* -----------------------------------------------------
//        PHOTO BOX

//        Passport size:
//        35mm x 45mm
//     ----------------------------------------------------- */

//     const photoWidth =
//       (35 * 72) /
//       25.4;

//     const photoHeight =
//       (45 * 72) /
//       25.4;

//     /*
//       Changed:
//       Photo box moved closer to the table.
//     */
//     const photoX =
//       tableX +
//       tableWidth +
//       8;

//     const photoY =
//       tableTop -
//       photoHeight;

//     page.drawRectangle({
//       x:
//         photoX,

//       y:
//         photoY,

//       width:
//         photoWidth,

//       height:
//         photoHeight,

//       borderWidth:
//         1,

//       borderColor:
//         black,
//     });

//     /* -----------------------------------------------------
//        STUDENT PHOTO
//     ----------------------------------------------------- */

//     const photoBuffer =
//       await getStudentPhoto(
//         student
//       );

//     if (
//       photoBuffer
//     ) {
//       const image =
//         await embedImage(
//           pdfDoc,
//           photoBuffer
//         );

//       if (
//         image
//       ) {
//         const padding =
//           7;

//         const availableWidth =
//           photoWidth -
//           padding * 2;

//         const availableHeight =
//           photoHeight -
//           padding * 2;

//         const scale =
//           Math.min(
//             availableWidth /
//               image.width,

//             availableHeight /
//               image.height
//           );

//         const imageWidth =
//           image.width *
//           scale;

//         const imageHeight =
//           image.height *
//           scale;

//         page.drawImage(
//           image,
//           {
//             x:
//               photoX +
//               (
//                 photoWidth -
//                 imageWidth
//               ) /
//                 2,

//             y:
//               photoY +
//               (
//                 photoHeight -
//                 imageHeight
//               ) /
//                 2,

//             width:
//               imageWidth,

//             height:
//               imageHeight,
//           }
//         );
//       }
//     }

//     /* -----------------------------------------------------
//        SAVE
//     ----------------------------------------------------- */

//     const pdfBytes =
//       await pdfDoc.save();

//     /* -----------------------------------------------------
//        RESPONSE
//     ----------------------------------------------------- */

//     if (res) {
//       res.setHeader(
//         "Content-Type",
//         "application/pdf"
//       );

//       res.setHeader(
//         "Content-Disposition",
//         `${
//           download
//             ? "attachment"
//             : "inline"
//         }; filename="l1-acknowledgement-${safeText(
//           srn,
//           "student"
//         )}.pdf"`
//       );

//       res.setHeader(
//         "Cache-Control",
//         "no-store, no-cache, must-revalidate, proxy-revalidate"
//       );

//       res.setHeader(
//         "Pragma",
//         "no-cache"
//       );

//       res.setHeader(
//         "Expires",
//         "0"
//       );

//       return res.end(
//         Buffer.from(
//           pdfBytes
//         )
//       );
//     }

//     return Buffer.from(
//       pdfBytes
//     );
//   };














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

/**
 * Select the correct acknowledgement slip template.
 *
 * Mission Buniyaad:
 * public/template/l1-ack-slip.pdf
 *
 * Haryana Super 100:
 * public/template/l1-ack-slip-hs100.pdf
 */
const getTemplatePath = (exam = {}, student = {}) => {
  const identifiers = [
    exam?.code,
    exam?.examCode,
    exam?.type,
    exam?.name,
    exam?.title,
    exam?.program,
    exam?.programName,
    exam?.programCode,
    exam?.examName,
    student?.program,
    student?.programName,
    student?.programCode,
  ];

  const examIdentifier = identifiers
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[\s_-]+/g, "");

  const isSuper100 =
    examIdentifier.includes("HS100") ||
    examIdentifier.includes("SUPER100");

  const templateFile = isSuper100
    ? "l1-ack-slip-hs100.pdf"
    : "l1-ack-slip.pdf";

  return path.resolve(
    process.cwd(),
    "public",
    "template",
    templateFile
  );
};

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

  return student?.isVerified ? "Verified" : "Pending";
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
    const signedUrl = await getSignedUrlForSpacesKey(
      key,
      600
    );

    const response = await fetch(signedUrl);

    if (!response.ok) {
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("Student photo load failed:", error);
    return null;
  }
};

/* =========================================================
   EMBED PHOTO
========================================================= */

const embedImage = async (pdfDoc, buffer) => {
  if (!buffer) {
    return null;
  }

  try {
    return await pdfDoc.embedJpg(buffer);
  } catch (_) {}

  try {
    return await pdfDoc.embedPng(buffer);
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
  const value = safeText(text, "");

  if (!value) return;

  const textWidth = font.widthOfTextAtSize(
    value,
    size
  );

  page.drawText(value, {
    x: x + (width - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
};

/* =========================================================
   TABLE TEXT WRAPPING
========================================================= */

const wrapText = (
  text,
  font,
  fontSize,
  maxWidth
) => {
  const value = safeText(text, "");

  if (!value) {
    return [""];
  }

  const words = value.split(/\s+/);
  const lines = [];
  let currentLine = "";

  const pushLongWord = (word) => {
    let chunk = "";

    for (const char of word) {
      const candidate = chunk + char;

      if (
        font.widthOfTextAtSize(candidate, fontSize) <=
          maxWidth ||
        !chunk
      ) {
        chunk = candidate;
      } else {
        lines.push(chunk);
        chunk = char;
      }
    }

    if (chunk) {
      lines.push(chunk);
    }
  };

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (
      font.widthOfTextAtSize(candidate, fontSize) <=
      maxWidth
    ) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (
      font.widthOfTextAtSize(word, fontSize) <=
      maxWidth
    ) {
      currentLine = word;
    } else {
      pushLongWord(word);
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
};

const getWrappedCellLines = (
  text,
  font,
  fontSize,
  width
) => {
  return wrapText(
    text,
    font,
    fontSize,
    width - 8
  );
};

/* =========================================================
   TABLE ROW HEIGHT
========================================================= */

const getTableRowHeight = ({
  label,
  value,
  labelFont,
  valueFont,
  fontSize = 7.8,
  baseHeight = 18,
  labelWidth,
  valueWidth,
}) => {
  const labelLines = getWrappedCellLines(
    label,
    labelFont,
    fontSize,
    labelWidth
  );

  const valueLines = getWrappedCellLines(
    value,
    valueFont,
    fontSize,
    valueWidth
  );

  const lineHeight = fontSize + 1.5;

  const lineCount = Math.max(
    labelLines.length,
    valueLines.length
  );

  return Math.max(
    baseHeight,
    lineCount * lineHeight + 2 * 3
  );
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
    fontSize = 7.8,
    verticalAlign = "middle",
  }
) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });

  const value = safeText(text, "");

  const paddingX = 4;
  const paddingY = 3;

  const lineHeight = fontSize + 1.5;

  const lines = getWrappedCellLines(
    value,
    font,
    fontSize,
    width
  );

  const contentHeight = lines.length * lineHeight;

  let startY;

  if (verticalAlign === "top") {
    startY =
      y + height - paddingY - fontSize;
  } else {
    startY =
      y +
      (height - contentHeight) / 2 +
      lineHeight -
      fontSize;
  }

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: x + paddingX,
      y: startY - index * lineHeight,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
};

/* =========================================================
   MAIN FUNCTION
========================================================= */

export const createL1AcknowledgementSlip = async ({
  student,
  exam,
  district,
  block,
  school,
  res = null,
  download = false,
}) => {
  /* -----------------------------------------------------
     LOAD DYNAMIC TEMPLATE
  ----------------------------------------------------- */

  // The correct template is selected using the exam/program.
  const templatePath = getTemplatePath(exam, student);

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Acknowledgement slip template not found: ${templatePath}`
    );
  }

  console.log(
    `[Acknowledgement Slip] Selected template: ${path.basename(
      templatePath
    )}`
  );

  const templateBytes = fs.readFileSync(templatePath);

  const pdfDoc = await PDFDocument.load(templateBytes);

  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.getPages()[0];

  if (!page) {
    throw new Error(
      `No PDF page found in template: ${templatePath}`
    );
  }

  const {
    width: pageWidth,
    height: pageHeight,
  } = page.getSize();

  /* -----------------------------------------------------
     FONTS
  ----------------------------------------------------- */

  const regularFont = await pdfDoc.embedFont(
    StandardFonts.Helvetica
  );

  const boldFont = await pdfDoc.embedFont(
    StandardFonts.HelveticaBold
  );

  let hindiFont = regularFont;
  let hindiBoldFont = boldFont;

  const hindiFontPath = getDevanagariFontPath();
  const hindiBoldFontPath = getDevanagariBoldFontPath();

  if (fs.existsSync(hindiFontPath)) {
    hindiFont = await pdfDoc.embedFont(
      fs.readFileSync(hindiFontPath)
    );
  }

  if (fs.existsSync(hindiBoldFontPath)) {
    hindiBoldFont = await pdfDoc.embedFont(
      fs.readFileSync(hindiBoldFontPath)
    );
  }

  /* -----------------------------------------------------
     COLORS
  ----------------------------------------------------- */

  const green = rgb(0.10, 0.40, 0.18);
  const red = rgb(0.80, 0.12, 0.10);
  const black = rgb(0, 0, 0);

  /* -----------------------------------------------------
     TOP HEADER
  ----------------------------------------------------- */

  const headerX = 110;
  const headerWidth = pageWidth - 220;

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

  const examCode = String(
    exam?.code ||
      exam?.examCode ||
      exam?.type ||
      exam?.name ||
      exam?.programName ||
      exam?.programCode ||
      ""
  ).toUpperCase();

  const isSuper100 =
    examCode.includes("100") ||
    examCode.includes("HS") ||
    examCode.includes("SUPER");

  const title = isSuper100
    ? "Haryana Super 100 Level 1 Registration Slip (2027-29)"
    : "Mission Buniyaad Level 1 Registration Slip (2027-29)";

  drawCenteredText(page, title, {
    x: headerX,
    y: pageHeight - 61,
    width: headerWidth,
    size: 12.5,
    font: regularFont,
    color: green,
  });

  /* -----------------------------------------------------
     REGISTRATION STATUS
  ----------------------------------------------------- */

  const status = getStatus(student);

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
          ? rgb(0.05, 0.48, 0.15)
          : red,
    }
  );

  /* -----------------------------------------------------
     REGISTRATION REMARK
  ----------------------------------------------------- */

  const registrationRemark = safeText(
    student?.registrationFormVerificationRemark,
    ""
  );

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

  const studentName = student?.name;
  const fatherName = student?.fatherName;
  const dob = formatDate(student?.dob);
  const category = student?.category;

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

  const districtText = district
    ? `${safeText(district.districtName)}${
        district.districtId
          ? ` (${district.districtId})`
          : ""
      }`
    : safeText(student?.districtName);

  const blockText = block
    ? `${safeText(block.blockName)}${
        block.blockId
          ? ` (${block.blockId})`
          : ""
      }`
    : safeText(student?.blockName);

  const schoolText =
    school?.schoolName ||
    student?.schoolNameManual ||
    student?.schoolName;

  const rows = [
    ["Student Name", studentName],
    ["Father Name", fatherName],
    ["Date of Birth", dob],
    ["Category", category],
    ["SRN Number", srn],
    ["Slip-Id", student?.slipId],
    ["Aadhar Number", aadhaar],
    ["Mobile Number", mobile],
    ["District", districtText],
    ["Block", blockText],
    ["School", schoolText],
  ];

  /* -----------------------------------------------------
     STUDENT TABLE
  ----------------------------------------------------- */

  const tableX = 48;
  const tableTop = pageHeight - 122;

  const labelWidth = 130;
  const tableWidth = 320;
  const valueWidth = tableWidth - labelWidth;

  const rowBaseHeight = 18;
  const cellFontSize = 7.8;

  const rowHeights = rows.map(
    ([label, value]) =>
      getTableRowHeight({
        label,
        value,
        labelFont: boldFont,
        valueFont: regularFont,
        fontSize: cellFontSize,
        baseHeight: rowBaseHeight,
        labelWidth,
        valueWidth,
      })
  );

  let currentTableTop = tableTop;

  rows.forEach(([label, value], index) => {
    const currentRowHeight = rowHeights[index];

    const y = currentTableTop - currentRowHeight;

    drawTableCell(page, {
      x: tableX,
      y,
      width: labelWidth,
      height: currentRowHeight,
      text: label,
      font: boldFont,
      fontSize: cellFontSize,
    });

    drawTableCell(page, {
      x: tableX + labelWidth,
      y,
      width: valueWidth,
      height: currentRowHeight,
      text: value,
      font: regularFont,
      fontSize: cellFontSize,
    });

    currentTableTop = y;
  });

  const tableHeight = rowHeights.reduce(
    (total, height) => total + height,
    0
  );

  const tableBottom = tableTop - tableHeight;

  /* -----------------------------------------------------
     PHOTO BOX
     Passport size: 35mm x 45mm
  ----------------------------------------------------- */

  const photoWidth = (35 * 72) / 25.4;
  const photoHeight = (45 * 72) / 25.4;

  // Keep the photo box close to the table.
  const photoX = tableX + tableWidth + 8;
  const photoY = tableTop - photoHeight;

  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoWidth,
    height: photoHeight,
    borderWidth: 1,
    borderColor: black,
  });

  /* -----------------------------------------------------
     STUDENT PHOTO
  ----------------------------------------------------- */

  const photoBuffer = await getStudentPhoto(student);

  if (photoBuffer) {
    const image = await embedImage(pdfDoc, photoBuffer);

    if (image) {
      const padding = 7;

      const availableWidth = photoWidth - padding * 2;
      const availableHeight = photoHeight - padding * 2;

      const scale = Math.min(
        availableWidth / image.width,
        availableHeight / image.height
      );

      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;

      page.drawImage(image, {
        x:
          photoX +
          (photoWidth - imageWidth) / 2,
        y:
          photoY +
          (photoHeight - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
      });
    }
  }

  /* -----------------------------------------------------
     SAVE PDF
  ----------------------------------------------------- */

  const pdfBytes = await pdfDoc.save();

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
        download ? "attachment" : "inline"
      }; filename="l1-acknowledgement-${safeText(
        srn,
        "student"
      )}.pdf"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.end(Buffer.from(pdfBytes));
  }

  return Buffer.from(pdfBytes);
};