import Anthropic from "@anthropic-ai/sdk";
import type {
  CustomerEmail,
  ExtractionResult,
  ShopifyOrderSummary,
} from "./types";

const isDemo = () => process.env.DEMO_MODE === "true";
const model = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt in der .env-Datei.");
  return new Anthropic({ apiKey });
}

function systemPrompt(): string {
  const store = process.env.STORE_NAME ?? "unser Shop";
  const signer = process.env.STORE_SIGNATURE_NAME ?? "Ihr Support-Team";
  return `Du bist der Kundenservice des Onlineshops "${store}".
Du schreibst professionelle, freundliche und präzise Antworten auf Kunden-E-Mails – immer auf Deutsch, in der Sie-Form.

Regeln:
- Beziehe dich konkret auf die vorliegenden Bestelldaten, wenn vorhanden (Bestellnummer, Artikel, Status, Sendungsverfolgung).
- Erfinde niemals Informationen, die nicht in den Bestelldaten stehen. Keine Zusagen zu Lieferterminen, Erstattungen oder Kulanz, die nicht aus den Daten hervorgehen.
- Wenn keine Bestellung gefunden wurde: Bitte höflich um die fehlenden Angaben (Bestellnummer, E-Mail-Adresse der Bestellung oder vollständiger Name), damit das Anliegen geprüft werden kann.
- Halte die Antwort kompakt: Begrüßung, Kern der Antwort, nächste Schritte, Grußformel.
- Signiere mit: "Mit freundlichen Grüßen\\n${signer}\\n${store}"
- Antworte ausschließlich mit dem E-Mail-Text. Kein Betreff, keine Kommentare, kein Markdown.`;
}

function contextBlock(
  email: CustomerEmail,
  extraction: ExtractionResult,
  order: ShopifyOrderSummary | null
): string {
  const orderInfo = order
    ? `GEFUNDENE BESTELLUNG (Quelle: Shopify, gefunden über ${order.matchedBy}):
- Bestellnummer: ${order.name}
- Kunde: ${order.customerName} (${order.customerEmail})
- Bestellt am: ${new Date(order.createdAt).toLocaleDateString("de-AT")}
- Zahlungsstatus: ${order.financialStatus}
- Versandstatus: ${order.fulfillmentStatus ?? "noch nicht versendet"}
- Summe: ${order.totalPrice} ${order.currency}
- Artikel: ${order.lineItems.map((li) => `${li.quantity}× ${li.title}`).join("; ")}
${order.trackingNumbers.length ? `- Sendungsnummer(n): ${order.trackingNumbers.join(", ")}` : ""}
${order.trackingUrls.length ? `- Tracking-Link(s): ${order.trackingUrls.join(", ")}` : ""}`
    : `KEINE BESTELLUNG GEFUNDEN. Erkannte Daten: Bestellnummer=${extraction.orderNumber ?? "–"}, Name=${extraction.customerName ?? "–"}, Absender=${extraction.email}. Bitte in der Antwort um Bestellnummer oder die bei der Bestellung verwendete E-Mail-Adresse bitten.`;

  return `KUNDEN-E-MAIL
Von: ${extraction.customerName ?? email.fromName ?? email.from} <${email.from}>
Betreff: ${email.subject}

${email.body}

---
${orderInfo}`;
}

export async function generateDraft(
  email: CustomerEmail,
  extraction: ExtractionResult,
  order: ShopifyOrderSummary | null
): Promise<string> {
  if (isDemo()) return demoDraft(email, extraction, order);

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1024,
    system: systemPrompt(),
    messages: [
      {
        role: "user",
        content: `${contextBlock(email, extraction, order)}

Verfasse jetzt die Antwort-E-Mail an den Kunden.`,
      },
    ],
  });
  return textOf(res);
}

export async function refineDraft(
  email: CustomerEmail,
  extraction: ExtractionResult,
  order: ShopifyOrderSummary | null,
  currentDraft: string,
  instruction: string
): Promise<string> {
  if (isDemo()) {
    return `${currentDraft}\n\n[Demo-Modus: Der Entwurf würde jetzt gemäß Ihrer Anweisung überarbeitet: „${instruction}“. Hinterlegen Sie einen Anthropic-API-Key und setzen Sie DEMO_MODE=false, um echte Überarbeitungen zu erhalten.]`;
  }

  const res = await client().messages.create({
    model: model(),
    max_tokens: 1024,
    system: systemPrompt(),
    messages: [
      {
        role: "user",
        content: `${contextBlock(email, extraction, order)}

Verfasse jetzt die Antwort-E-Mail an den Kunden.`,
      },
      { role: "assistant", content: currentDraft },
      {
        role: "user",
        content: `Überarbeite die Antwort mit folgender Änderung: "${instruction}". Antworte wieder ausschließlich mit dem vollständigen E-Mail-Text.`,
      },
    ],
  });
  return textOf(res);
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/* ── Demo-Entwürfe (ohne API-Key) ─────────────────────────── */

function demoDraft(
  email: CustomerEmail,
  extraction: ExtractionResult,
  order: ShopifyOrderSummary | null
): string {
  const store = process.env.STORE_NAME ?? "Mein Shop";
  const signer = process.env.STORE_SIGNATURE_NAME ?? "Ihr Support-Team";
  const anrede = extraction.customerName
    ? `Sehr geehrte/r ${extraction.customerName},`
    : "Guten Tag,";

  if (!order) {
    return `${anrede}

vielen Dank für Ihre Nachricht. Damit wir Ihr Anliegen prüfen können, benötigen wir noch eine Angabe von Ihnen: Bitte teilen Sie uns Ihre Bestellnummer (z. B. #1042) oder die E-Mail-Adresse mit, die Sie bei der Bestellung verwendet haben.

Sobald wir diese Information haben, kümmern wir uns umgehend um Ihr Anliegen.

Mit freundlichen Grüßen
${signer}
${store}`;
  }

  const tracking = order.trackingUrls[0]
    ? `Den aktuellen Stand Ihrer Sendung (${order.trackingNumbers[0]}) können Sie hier verfolgen: ${order.trackingUrls[0]}`
    : `Ihre Bestellung wird derzeit für den Versand vorbereitet.`;

  return `${anrede}

vielen Dank für Ihre Nachricht zu Ihrer Bestellung ${order.name} vom ${new Date(order.createdAt).toLocaleDateString("de-AT")}.

${tracking}

Sollten Sie darüber hinaus Fragen haben, melden Sie sich gerne jederzeit.

Mit freundlichen Grüßen
${signer}
${store}`;
}
