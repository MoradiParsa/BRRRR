/* -------------------------------------------------------------------------- */
/*  Property extraction — turn an uploaded file into prefilled property data.  */
/*                                                                            */
/*  This local version extracts text from text-based PDFs in the browser      */
/*  (no library, no API) and parses listing fields with heuristics. Images    */
/*  and scanned PDFs need OCR/AI, which aren't available locally yet — those   */
/*  return a "limited" result. The FileExtractor interface + registry let us   */
/*  later drop in OCR, OpenAI/Claude, or MLS/Zillow providers without         */
/*  changing the Property model or the review UI.                             */
/* -------------------------------------------------------------------------- */

import { emptyDealState, type DealState } from "./deals";

/* ------------------------------- field model ------------------------------ */

/** Flat, all-string fields shown on the editable review screen. */
export type ExtractedFields = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  lotSize: string;
  yearBuilt: string;
  taxes: string;
  hoa: string;
  description: string;
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  mlsNumber: string;
};

export type ExtractedKey = keyof ExtractedFields;

export const EXTRACTED_KEYS: ExtractedKey[] = [
  "name",
  "address",
  "city",
  "state",
  "zip",
  "price",
  "beds",
  "baths",
  "sqft",
  "lotSize",
  "yearBuilt",
  "taxes",
  "hoa",
  "description",
  "agentName",
  "agentPhone",
  "agentEmail",
  "mlsNumber",
];

export const FIELD_LABELS: Record<ExtractedKey, string> = {
  name: "Property name",
  address: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  price: "List / purchase price",
  beds: "Beds",
  baths: "Baths",
  sqft: "Square footage",
  lotSize: "Lot size",
  yearBuilt: "Year built",
  taxes: "Property taxes",
  hoa: "HOA",
  description: "Description",
  agentName: "Agent name",
  agentPhone: "Agent phone",
  agentEmail: "Agent email",
  mlsNumber: "MLS number",
};

export type FieldConfidence = Partial<Record<ExtractedKey, number>>;

export function emptyExtractedFields(): ExtractedFields {
  return {
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
    lotSize: "",
    yearBuilt: "",
    taxes: "",
    hoa: "",
    description: "",
    agentName: "",
    agentPhone: "",
    agentEmail: "",
    mlsNumber: "",
  };
}

/** Normalized extraction result (the spec-required shape, plus UI extras). */
export type PropertyExtractionResult = {
  confidence: number; // 0–1
  fields: Partial<DealState>; // ready-to-apply mapped data
  missingFields: string[];
  warnings: string[];
  rawText?: string;
  // UI helpers (superset of the required shape):
  extracted: ExtractedFields;
  fieldConfidence: FieldConfidence;
  fileName: string;
  limited: boolean; // true when local extraction can't read the file well
};

/* ------------------------------ field mapping ----------------------------- */

const toNum = (s: string): number | null => {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : null;
};

function composeCityState(f: ExtractedFields): string {
  const tail = [f.state.trim(), f.zip.trim()].filter(Boolean).join(" ");
  const city = f.city.trim();
  if (city && tail) return `${city}, ${tail}`;
  return city || tail;
}

function composeNotes(f: ExtractedFields, fileName: string): string {
  const lines: string[] = [];
  if (f.description.trim()) lines.push(f.description.trim());
  const facts: string[] = [];
  if (f.yearBuilt.trim()) facts.push(`Year built: ${f.yearBuilt.trim()}`);
  if (f.lotSize.trim()) facts.push(`Lot size: ${f.lotSize.trim()}`);
  if (f.mlsNumber.trim()) facts.push(`MLS #: ${f.mlsNumber.trim()}`);
  if (facts.length) lines.push(facts.join(" · "));
  const agent = [f.agentName.trim(), f.agentPhone.trim(), f.agentEmail.trim()]
    .filter(Boolean)
    .join(" · ");
  if (agent) lines.push(`Listing agent: ${agent}`);
  lines.push(`Imported from ${fileName}`);
  return lines.join("\n\n");
}

/** Build a full property from reviewed fields (deep-merged onto a blank deal). */
export function dealStateFromExtracted(
  f: ExtractedFields,
  fileName: string,
): DealState {
  const base = emptyDealState();
  const beds = toNum(f.beds);
  const baths = toNum(f.baths);
  const sqft = toNum(f.sqft);
  return {
    ...base,
    values: {
      ...base.values,
      purchasePrice: toNum(f.price),
      taxes: toNum(f.taxes),
      hoa: toNum(f.hoa),
    },
    subject: { sqft, beds, baths },
    property: {
      name: f.name.trim() || f.address.trim() || "",
      address: f.address.trim(),
      cityState: composeCityState(f),
      beds,
      baths,
      sqft,
    },
    notes: composeNotes(f, fileName),
    status: "analyzing",
    sourceType: "pdf",
    sourceFileName: fileName,
    importedAt: Date.now(),
  };
}

/* ------------------------------ PDF text read ----------------------------- */

const latin1 = (bytes: Uint8Array): string =>
  new TextDecoder("latin1").decode(bytes);

async function inflate(
  bytes: Uint8Array,
  format: "deflate" | "deflate-raw",
): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/** Decode a PDF literal string body (between parens), resolving escapes. */
function decodeLiteral(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") {
      const n = body[i + 1];
      if (n === undefined) break;
      if (n >= "0" && n <= "7") {
        let oct = n;
        i++;
        for (let k = 0; k < 2 && body[i + 1] >= "0" && body[i + 1] <= "7"; k++) {
          oct += body[++i];
        }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      } else {
        const map: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          b: "\b",
          f: "\f",
          "(": "(",
          ")": ")",
          "\\": "\\",
        };
        out += map[n] ?? n;
        i++;
      }
    } else {
      out += c;
    }
  }
  return out;
}

function decodeHex(body: string): string {
  const hex = body.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/** Pull visible text from one decompressed content stream. */
function textFromContent(content: string): string {
  let out = "";
  // Match a string operand (literal or hex, possibly an array) before a
  // text-showing operator (Tj, TJ, ', ").
  const re =
    /(\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\[(?:[^\][]|\\.)*\])\s*(TJ|Tj|'|")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const operand = m[1];
    if (operand.startsWith("[")) {
      // TJ array: concatenate the strings inside, ignoring kerning numbers.
      const inner = operand.slice(1, -1);
      const sre = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>/g;
      let sm: RegExpExecArray | null;
      while ((sm = sre.exec(inner)) !== null) {
        const s = sm[0];
        out += s.startsWith("<")
          ? decodeHex(s.slice(1, -1))
          : decodeLiteral(s.slice(1, -1));
      }
    } else if (operand.startsWith("<")) {
      out += decodeHex(operand.slice(1, -1));
    } else {
      out += decodeLiteral(operand.slice(1, -1));
    }
    if (m[2] === "'" || m[2] === '"') out += "\n";
    else out += " ";
  }
  return out;
}

/** Best-effort browser PDF text extraction (no library). */
export async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = latin1(bytes);
  const pieces: string[] = [];

  // Walk every `stream ... endstream` block.
  const streamRe = /stream\r?\n/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRe.exec(raw)) !== null) {
    const start = sm.index + sm[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    let data = bytes.subarray(start, end);
    // Trim a trailing EOL before endstream.
    while (data.length && (data[data.length - 1] === 10 || data[data.length - 1] === 13)) {
      data = data.subarray(0, data.length - 1);
    }
    let content: string | null = null;
    for (const fmt of ["deflate", "deflate-raw"] as const) {
      try {
        content = latin1(await inflate(data, fmt));
        break;
      } catch {
        /* try next */
      }
    }
    if (content === null) content = latin1(data); // uncompressed stream
    if (/(?:Tj|TJ)\b/.test(content)) pieces.push(textFromContent(content));
  }

  let text = pieces.join("\n");
  // Fallback: some simple PDFs aren't compressed — scan the raw body too.
  if (text.replace(/[^a-zA-Z]/g, "").length < 40) {
    text += "\n" + textFromContent(raw);
  }
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

/* ----------------------------- field parsing ------------------------------ */

const STATE_RE =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

const STREET_RE =
  "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Hwy|Highway|Pkwy|Parkway|Trl|Trail|Loop)";

function firstMatch(
  text: string,
  patterns: { re: RegExp; group?: number; conf: number }[],
): { value: string; conf: number } | null {
  for (const { re, group = 1, conf } of patterns) {
    const m = re.exec(text);
    if (m && m[group]) return { value: m[group].trim(), conf };
  }
  return null;
}

/** Parse listing fields from extracted text using heuristics. */
export function parseListingText(text: string): {
  extracted: ExtractedFields;
  fieldConfidence: FieldConfidence;
  warnings: string[];
} {
  const e = emptyExtractedFields();
  const conf: FieldConfidence = {};
  const warnings: string[] = [];
  const set = (k: ExtractedKey, r: { value: string; conf: number } | null) => {
    if (r && r.value) {
      e[k] = r.value;
      conf[k] = r.conf;
    }
  };

  set(
    "price",
    firstMatch(text, [
      { re: /(?:list(?:ing)?\s*price|offered\s*at|asking|price)\D{0,12}\$?\s*([\d,]{4,})/i, conf: 0.85 },
      { re: /\$\s*([\d,]{5,})/, conf: 0.5 },
    ]),
  );
  set(
    "beds",
    firstMatch(text, [
      { re: /(\d+(?:\.\d+)?)\s*(?:bedrooms?|beds?|bd|br)\b/i, conf: 0.8 },
      { re: /\bbeds?\b\D{0,6}(\d+(?:\.\d+)?)/i, conf: 0.7 },
    ]),
  );
  set(
    "baths",
    firstMatch(text, [
      { re: /(\d+(?:\.\d+)?)\s*(?:bathrooms?|baths?|ba)\b/i, conf: 0.8 },
      { re: /\bbaths?\b\D{0,6}(\d+(?:\.\d+)?)/i, conf: 0.7 },
    ]),
  );
  set(
    "sqft",
    firstMatch(text, [
      { re: /([\d,]{3,})\s*(?:sq\.?\s*ft|sqft|square\s*f(?:ee|oo)t|sf)\b/i, conf: 0.8 },
    ]),
  );
  set(
    "lotSize",
    firstMatch(text, [
      { re: /lot\s*size\D{0,10}([\d,.]+\s*(?:acres?|ac\b|sq\.?\s*ft|sqft))/i, conf: 0.75 },
      { re: /([\d,.]+\s*acres?)\b/i, conf: 0.5 },
    ]),
  );
  set(
    "yearBuilt",
    firstMatch(text, [
      { re: /(?:year\s*built|built\s*in|yr\s*built)\D{0,6}((?:18|19|20)\d{2})/i, conf: 0.8 },
    ]),
  );
  set(
    "taxes",
    firstMatch(text, [
      { re: /(?:property\s*tax(?:es)?|annual\s*tax(?:es)?|taxes?)\D{0,12}\$?\s*([\d,]{3,})/i, conf: 0.75 },
    ]),
  );
  set(
    "hoa",
    firstMatch(text, [
      { re: /hoa\D{0,12}\$?\s*([\d,]{2,})/i, conf: 0.7 },
    ]),
  );
  set(
    "mlsNumber",
    firstMatch(text, [
      { re: /\bMLS\s*#?\s*:?\s*([A-Za-z]?\d{4,}[A-Za-z0-9-]*)/i, conf: 0.85 },
    ]),
  );
  set(
    "agentEmail",
    firstMatch(text, [
      { re: /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/, conf: 0.85 },
    ]),
  );
  set(
    "agentPhone",
    firstMatch(text, [
      { re: /(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})/, conf: 0.7 },
    ]),
  );
  set(
    "agentName",
    firstMatch(text, [
      { re: /(?:listed\s*by|presented\s*by|listing\s*agent|agent)\s*:?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i, conf: 0.55 },
    ]),
  );
  set(
    "address",
    firstMatch(text, [
      {
        re: new RegExp(
          `(\\d{1,6}(?!\\s*(?:bed|bath|ba|bd|br|sq)\\w*)\\s+[A-Za-z0-9.'\\- ]{2,40}?\\s${STREET_RE}\\b\\.?)`,
          "i",
        ),
        conf: 0.75,
      },
    ]),
  );

  const csz = new RegExp(`([A-Za-z][A-Za-z .'\\-]{1,30}),\\s*(${STATE_RE})\\s*(\\d{5})`).exec(
    text,
  );
  if (csz) {
    e.city = csz[1].trim();
    e.state = csz[2].toUpperCase();
    e.zip = csz[3];
    conf.city = 0.75;
    conf.state = 0.85;
    conf.zip = 0.85;
  }

  if (e.address) {
    e.name = e.address;
    conf.name = conf.address;
  }

  return { extracted: e, fieldConfidence: conf, warnings };
}

/* ------------------------------- extractors ------------------------------- */

const KEY_FIELDS: ExtractedKey[] = ["price", "beds", "baths", "sqft", "address"];

function buildResult(
  extracted: ExtractedFields,
  fieldConfidence: FieldConfidence,
  warnings: string[],
  rawText: string | undefined,
  fileName: string,
  limited: boolean,
): PropertyExtractionResult {
  const foundKey = KEY_FIELDS.filter((k) => extracted[k]).length;
  let confidence = foundKey / KEY_FIELDS.length;
  if (limited) confidence = 0;
  const missingFields = EXTRACTED_KEYS.filter((k) => !extracted[k]).map(
    (k) => FIELD_LABELS[k],
  );
  return {
    confidence,
    fields: dealStateFromExtracted(extracted, fileName),
    missingFields,
    warnings,
    rawText,
    extracted,
    fieldConfidence,
    fileName,
    limited,
  };
}

/** A pluggable extractor — future OCR/AI/MLS providers implement this. */
export interface FileExtractor {
  id: string;
  label: string;
  canHandle(file: File): boolean;
  extract(file: File): Promise<PropertyExtractionResult>;
}

const isImage = (file: File) =>
  /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name) ||
  file.type.startsWith("image/");

const isPdf = (file: File) =>
  /\.pdf$/i.test(file.name) || file.type === "application/pdf";

export const localPdfExtractor: FileExtractor = {
  id: "local-pdf",
  label: "Local PDF text reader",
  canHandle: isPdf,
  async extract(file) {
    let rawText = "";
    try {
      rawText = await extractPdfText(file);
    } catch {
      return buildResult(
        emptyExtractedFields(),
        {},
        [
          "We couldn't read this PDF locally. It may be scanned or image-based — automatic reading of those needs OCR (coming soon).",
        ],
        undefined,
        file.name,
        true,
      );
    }
    const letters = rawText.replace(/[^a-zA-Z]/g, "").length;
    if (letters < 40) {
      return buildResult(
        emptyExtractedFields(),
        {},
        [
          "This PDF has little selectable text — it's likely scanned or image-based. OCR-based reading is coming soon.",
        ],
        rawText,
        file.name,
        true,
      );
    }
    const { extracted, fieldConfidence, warnings } = parseListingText(rawText);
    return buildResult(
      extracted,
      fieldConfidence,
      warnings,
      rawText.slice(0, 8000),
      file.name,
      false,
    );
  },
};

export const imageExtractor: FileExtractor = {
  id: "local-image",
  label: "Image reader",
  canHandle: isImage,
  async extract(file) {
    return buildResult(
      emptyExtractedFields(),
      {},
      [
        "Reading text from images requires OCR, which isn't available locally yet. You can enter the details manually below or attach the file to a blank property.",
      ],
      undefined,
      file.name,
      true,
    );
  },
};

/**
 * Future extractors slot in here (and take priority over local ones):
 *   - openAiExtractor / claudeExtractor (LLM extraction, needs API key)
 *   - ocrExtractor (Tesseract / cloud OCR for scanned PDFs + images)
 *   - mlsExtractor / zillowExtractor (provider APIs)
 * They implement FileExtractor and never change the Property model.
 */
export const EXTRACTORS: FileExtractor[] = [localPdfExtractor, imageExtractor];

export const ACCEPTED_FILE_TYPES =
  ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function canExtract(file: File): boolean {
  return EXTRACTORS.some((x) => x.canHandle(file));
}

/** Dispatch a file to the first extractor that can handle it. */
export async function extractProperty(
  file: File,
): Promise<PropertyExtractionResult> {
  const extractor = EXTRACTORS.find((x) => x.canHandle(file));
  if (!extractor) {
    return buildResult(
      emptyExtractedFields(),
      {},
      ["Unsupported file type. Upload a PDF, PNG, JPG, or WEBP."],
      undefined,
      file.name,
      true,
    );
  }
  try {
    return await extractor.extract(file);
  } catch {
    return buildResult(
      emptyExtractedFields(),
      {},
      ["Something went wrong reading this file. You can still enter details manually."],
      undefined,
      file.name,
      true,
    );
  }
}
