import type {
  CustomerEmail,
  ExtractionResult,
  ShopifyOrderSummary,
} from "./types";

export const demoEmails: CustomerEmail[] = [
  {
    id: "demo-1",
    from: "julia.brunner@gmx.at",
    fromName: "Julia Brunner",
    subject: "Wo bleibt meine Bestellung #1042?",
    body: `Hallo,

ich habe vor über einer Woche bestellt (Bestellung #1042) und bis heute kein Paket erhalten. Können Sie mir bitte sagen, wo meine Lieferung bleibt?

Mit freundlichen Grüßen
Julia Brunner`,
    receivedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    status: "neu",
  },
  {
    id: "demo-2",
    from: "m.hofer1988@gmail.com",
    fromName: "",
    subject: "Falscher Artikel geliefert",
    body: `Guten Tag,

in meiner Lieferung war leider das falsche Produkt. Ich habe die Laufsocken in Größe 43 bestellt, bekommen habe ich Größe 39. Wie kann ich das umtauschen?

Viele Grüße
Martin Hofer`,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    status: "neu",
  },
  {
    id: "demo-3",
    from: "kontaktform@webmail.at",
    fromName: "",
    subject: "Frage zu meiner Bestellung",
    body: `Hi, meine Bestellung ist noch nicht da. Wann kommt sie??`,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    status: "neu",
  },
  {
    id: "demo-4",
    from: "sarah.pichler@aon.at",
    fromName: "Sarah Pichler",
    subject: "Rechnung benötigt",
    body: `Sehr geehrtes Team,

könnten Sie mir bitte die Rechnung zu meiner letzten Bestellung zusenden? Ich benötige sie für die Firma.

Beste Grüße
Sarah Pichler`,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    status: "neu",
  },
];

const demoOrders: ShopifyOrderSummary[] = [
  {
    id: 5501,
    name: "#1042",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    totalPrice: "89.90",
    currency: "EUR",
    customerName: "Julia Brunner",
    customerEmail: "julia.brunner@gmx.at",
    trackingNumbers: ["AT2039481027"],
    trackingUrls: ["https://www.post.at/sv/sendungssuche?snr=AT2039481027"],
    lineItems: [
      { title: "Trailrunning-Schuhe Terra X2, Gr. 42", quantity: 1, price: "79.90" },
      { title: "Merino-Laufsocken, Gr. 42", quantity: 1, price: "10.00" },
    ],
    matchedBy: "bestellnummer",
  },
  {
    id: 5512,
    name: "#1057",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    totalPrice: "24.90",
    currency: "EUR",
    customerName: "Martin Hofer",
    customerEmail: "m.hofer1988@gmail.com",
    trackingNumbers: ["AT2039485566"],
    trackingUrls: ["https://www.post.at/sv/sendungssuche?snr=AT2039485566"],
    lineItems: [
      { title: "Merino-Laufsocken, Gr. 43 (3er-Pack)", quantity: 1, price: "24.90" },
    ],
    matchedBy: "email",
  },
  {
    id: 5520,
    name: "#1063",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    financialStatus: "paid",
    fulfillmentStatus: null,
    totalPrice: "134.50",
    currency: "EUR",
    customerName: "Sarah Pichler",
    customerEmail: "sarah.pichler@aon.at",
    trackingNumbers: [],
    trackingUrls: [],
    lineItems: [
      { title: "Laufjacke WindShield, Gr. S", quantity: 1, price: "119.00" },
      { title: "Stirnband Reflect", quantity: 1, price: "15.50" },
    ],
    matchedBy: "email",
  },
];

export function findDemoOrder(
  extraction: ExtractionResult
): ShopifyOrderSummary | null {
  if (extraction.orderNumber) {
    const byNumber = demoOrders.find((o) => o.name === extraction.orderNumber);
    if (byNumber) return { ...byNumber, matchedBy: "bestellnummer" };
  }
  if (extraction.email) {
    const byEmail = demoOrders.find(
      (o) => o.customerEmail.toLowerCase() === extraction.email
    );
    if (byEmail) return { ...byEmail, matchedBy: "email" };
  }
  if (extraction.customerName) {
    const byName = demoOrders.find(
      (o) =>
        o.customerName.toLowerCase() === extraction.customerName!.toLowerCase()
    );
    if (byName) return { ...byName, matchedBy: "name" };
  }
  return null;
}
