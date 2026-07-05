import type { CustomerEmail, ExtractionResult } from "./types";

/**
 * Extrahiert Bestellnummer, Kundenname und E-Mail-Adresse aus einer
 * Kunden-E-Mail. Die E-Mail-Adresse des Absenders ist immer vorhanden;
 * Bestellnummer und Name werden heuristisch aus Betreff + Text gelesen.
 */
export function extractCustomerData(email: CustomerEmail): ExtractionResult {
  const text = `${email.subject}\n${email.body}`;

  return {
    orderNumber: extractOrderNumber(text),
    customerName: extractName(email),
    email: email.from.toLowerCase().trim(),
  };
}

function extractOrderNumber(text: string): string | null {
  // 1) Explizit: "Bestellung #1042", "Bestellnummer: 1042", "Order 1042"
  const keyword =
    /(?:bestell(?:ung|nummer|nr\.?)|order(?:\s*(?:no\.?|number|nummer))?|auftrag(?:snummer)?)\s*[:#\-]?\s*#?\s*([A-Z]{0,3}\d{3,8})/i;
  const kwMatch = text.match(keyword);
  if (kwMatch) return normalize(kwMatch[1]);

  // 2) Raute-Notation irgendwo im Text: "#1042"
  const hash = text.match(/#\s?(\d{3,8})\b/);
  if (hash) return normalize(hash[1]);

  return null;
}

function normalize(raw: string): string {
  const digits = raw.replace(/^[A-Z]+/i, "");
  return `#${digits}`;
}

function extractName(email: CustomerEmail): string | null {
  // 1) Anzeigename des Absenders (sofern keine reine Adresse)
  const display = email.fromName?.trim();
  if (display && !display.includes("@") && /[a-zäöüß]/i.test(display)) {
    return cleanupName(display);
  }

  // 2) Grußformel am Ende: "Mit freundlichen Grüßen, Max Mustermann",
  //    "Liebe Grüße", "LG", "Viele Grüße", "Beste Grüße", "MfG", "VG"
  const signoff =
    /(?:mit\s+freundlichen\s+grüßen|freundliche\s+grüße|viele\s+grüße|liebe\s+grüße|beste\s+grüße|schöne\s+grüße|herzliche\s+grüße|mfg|lg|vg)\s*[,;]?\s*\n?\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+){0,2})/i;
  const sig = email.body.match(signoff);
  if (sig) return cleanupName(sig[1]);

  return null;
}

function cleanupName(name: string): string {
  return name
    .replace(/["'<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
