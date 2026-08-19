/**
 * Tesseract.js OCR integration for client-side document processing.
 *
 * This module provides OCR capabilities using Tesseract.js, which runs
 * entirely in the browser using WebAssembly. No server-side processing needed.
 *
 * Features:
 * - Client-side OCR (no data leaves the device)
 * - Multi-language support (English, Arabic, French)
 * - Document classification (ID, certificate, license)
 * - Field extraction (name, number, date, etc.)
 * - Confidence scoring
 *
 * Setup:
 * 1. Install: npm install tesseract.js
 * 2. Import and use the OCR functions
 */

// Dynamic import for Tesseract.js (optional dependency)
let Tesseract: any = null;

async function loadTesseract() {
  if (!Tesseract) {
    try {
      Tesseract = await import("tesseract.js");
    } catch (error) {
      console.warn("[OCR] Tesseract.js not installed. Run: npm install tesseract.js");
      return null;
    }
  }
  return Tesseract;
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }[];
}

export interface DocumentExtraction {
  type: DocumentType;
  fields: Record<string, string>;
  confidence: number;
  rawText: string;
}

export type DocumentType =
  | "national_id"
  | "passport"
  | "drivers_license"
  | "certificate"
  | "commercial_register"
  | "unknown";

/**
 * Process an image file with OCR
 */
export async function processImage(
  file: File | Blob,
  options: {
    language?: string;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<OCRResult> {
  const { language = "eng+ara", onProgress } = options;

  const tess = await loadTesseract();
  if (!tess) {
    throw new Error("OCR engine not available");
  }

  const worker = await tess.createWorker(language);

  try {
    // Set up progress callback
    if (onProgress) {
      worker.onProgress = (p: { progress: number }) => {
        onProgress(p.progress * 100);
      };
    }

    const { data } = await worker.recognize(file);

    return {
      text: data.text,
      confidence: data.confidence,
      words: data.words.map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox,
      })),
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract structured fields from OCR text based on document type
 */
export function extractDocumentFields(
  text: string,
  documentType: DocumentType
): DocumentExtraction {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  switch (documentType) {
    case "national_id":
      return extractNationalId(normalizedText);
    case "passport":
      return extractPassport(normalizedText);
    case "drivers_license":
      return extractDriversLicense(normalizedText);
    case "certificate":
      return extractCertificate(normalizedText);
    case "commercial_register":
      return extractCommercialRegister(normalizedText);
    default:
      return {
        type: "unknown",
        fields: {},
        confidence: 0,
        rawText: normalizedText,
      };
  }
}

/**
 * Extract fields from Lebanese National ID
 */
function extractNationalId(text: string): DocumentExtraction {
  const fields: Record<string, string> = {};

  // Lebanese ID format: 12 digits (DDMMYYYY + sequence)
  const idMatch = text.match(/\b(\d{12})\b/);
  if (idMatch) {
    fields.id_number = idMatch[1];
  }

  // Name extraction (usually in Arabic)
  const nameMatch = text.match(/(?:الاسم|Name)[\s:]+([^\n]+)/i);
  if (nameMatch) {
    fields.name = nameMatch[1].trim();
  }

  // Date of birth
  const dobMatch = text.match(/(?:تاريخ الميلاد|Date of Birth|DOB)[\s:]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  if (dobMatch) {
    fields.date_of_birth = dobMatch[1];
  }

  // Nationality
  const nationalityMatch = text.match(/(?:الجنسية|Nationality)[\s:]+([^\n]+)/i);
  if (nationalityMatch) {
    fields.nationality = nationalityMatch[1].trim();
  }

  return {
    type: "national_id",
    fields,
    confidence: calculateConfidence(fields, 5),
    rawText: text,
  };
}

/**
 * Extract fields from Passport
 */
function extractPassport(text: string): DocumentExtraction {
  const fields: Record<string, string> = {};

  // MRZ line (Machine Readable Zone)
  const mrzMatch = text.match(/P<[A-Z]{3}([A-Z<]+)<<([A-Z<]+)/);
  if (mrzMatch) {
    fields.last_name = mrzMatch[1].replace(/</g, " ").trim();
    fields.first_name = mrzMatch[2].replace(/</g, " ").trim();
  }

  // Passport number
  const passportMatch = text.match(/(?:Passport|جواز)[\s#]+([A-Z0-9]+)/i);
  if (passportMatch) {
    fields.passport_number = passportMatch[1];
  }

  // Nationality
  const nationalityMatch = text.match(/(?:Nationality|الجنسية)[\s:]+([^\n]+)/i);
  if (nationalityMatch) {
    fields.nationality = nationalityMatch[1].trim();
  }

  // Expiry date
  const expiryMatch = text.match(/(?:Expiry|انتهاء|Expires)[\s:]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  if (expiryMatch) {
    fields.expiry_date = expiryMatch[1];
  }

  return {
    type: "passport",
    fields,
    confidence: calculateConfidence(fields, 6),
    rawText: text,
  };
}

/**
 * Extract fields from Driver's License
 */
function extractDriversLicense(text: string): DocumentExtraction {
  const fields: Record<string, string> = {};

  // License number
  const licenseMatch = text.match(/(?:License|رخصة)[\s#]+([A-Z0-9]+)/i);
  if (licenseMatch) {
    fields.license_number = licenseMatch[1];
  }

  // Name
  const nameMatch = text.match(/(?:الاسم|Name)[\s:]+([^\n]+)/i);
  if (nameMatch) {
    fields.name = nameMatch[1].trim();
  }

  // Categories
  const categoriesMatch = text.match(/(?:Categories|الفئات)[\s:]+([A-Z,\s]+)/i);
  if (categoriesMatch) {
    fields.categories = categoriesMatch[1].trim();
  }

  // Expiry date
  const expiryMatch = text.match(/(?:Expiry|انتهاء|Expires)[\s:]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  if (expiryMatch) {
    fields.expiry_date = expiryMatch[1];
  }

  return {
    type: "drivers_license",
    fields,
    confidence: calculateConfidence(fields, 5),
    rawText: text,
  };
}

/**
 * Extract fields from Professional Certificate
 */
function extractCertificate(text: string): DocumentExtraction {
  const fields: Record<string, string> = {};

  // Certificate name
  const certNameMatch = text.match(/(?:Certificate|شهادة|Diploma)[\s:]+([^\n]+)/i);
  if (certNameMatch) {
    fields.certificate_name = certNameMatch[1].trim();
  }

  // Issuer
  const issuerMatch = text.match(/(?:Issued by|صدر من|University|Institute)[\s:]+([^\n]+)/i);
  if (issuerMatch) {
    fields.issuer = issuerMatch[1].trim();
  }

  // Year
  const yearMatch = text.match(/(?:Year|السنة|Date)[\s:]+(\d{4})/i);
  if (yearMatch) {
    fields.year = yearMatch[1];
  }

  // Holder name
  const nameMatch = text.match(/(?:Presented to|مقدم لـ|Awarded to)[\s:]+([^\n]+)/i);
  if (nameMatch) {
    fields.holder_name = nameMatch[1].trim();
  }

  return {
    type: "certificate",
    fields,
    confidence: calculateConfidence(fields, 5),
    rawText: text,
  };
}

/**
 * Extract fields from Commercial Register
 */
function extractCommercialRegister(text: string): DocumentExtraction {
  const fields: Record<string, string> = {};

  // Register number
  const regMatch = text.match(/(?:Register|سجل|Commercial)[\s#]+([A-Z0-9\-\/]+)/i);
  if (regMatch) {
    fields.register_number = regMatch[1];
  }

  // Company name
  const nameMatch = text.match(/(?:Company|شركة|Business)[\s:]+([^\n]+)/i);
  if (nameMatch) {
    fields.company_name = nameMatch[1].trim();
  }

  // Activity
  const activityMatch = text.match(/(?:Activity|نشاط)[\s:]+([^\n]+)/i);
  if (activityMatch) {
    fields.activity = activityMatch[1].trim();
  }

  // Capital
  const capitalMatch = text.match(/(?:Capital|رأس المال)[\s:]+([^\n]+)/i);
  if (capitalMatch) {
    fields.capital = capitalMatch[1].trim();
  }

  return {
    type: "commercial_register",
    fields,
    confidence: calculateConfidence(fields, 5),
    rawText: text,
  };
}

/**
 * Calculate confidence score based on extracted fields
 */
function calculateConfidence(
  fields: Record<string, string>,
  totalPossibleFields: number
): number {
  const filledFields = Object.keys(fields).length;
  return Math.round((filledFields / totalPossibleFields) * 100);
}

/**
 * Classify document type based on OCR text
 */
export function classifyDocument(text: string): DocumentType {
  const lowerText = text.toLowerCase();

  // Lebanese National ID patterns
  if (
    lowerText.includes("هوية وطنية") ||
    lowerText.includes("national id") ||
    lowerText.includes("بطاقة هوية") ||
    /\b\d{12}\b/.test(text)
  ) {
    return "national_id";
  }

  // Passport patterns
  if (
    lowerText.includes("passport") ||
    lowerText.includes("جواز سفر") ||
    lowerText.includes("p<")
  ) {
    return "passport";
  }

  // Driver's license patterns
  if (
    lowerText.includes("driver") ||
    lowerText.includes("رخصة قيادة") ||
    lowerText.includes("licence") ||
    lowerText.includes("license")
  ) {
    return "drivers_license";
  }

  // Commercial register patterns
  if (
    lowerText.includes("commercial register") ||
    lowerText.includes("سجل تجاري") ||
    lowerText.includes("company") ||
    lowerText.includes("شركة")
  ) {
    return "commercial_register";
  }

  // Certificate patterns
  if (
    lowerText.includes("certificate") ||
    lowerText.includes("شهادة") ||
    lowerText.includes("diploma") ||
    lowerText.includes("degree")
  ) {
    return "certificate";
  }

  return "unknown";
}
