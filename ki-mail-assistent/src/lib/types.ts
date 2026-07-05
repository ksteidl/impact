export type EmailStatus = "neu" | "entwurf" | "info_fehlt" | "gesendet";

export interface CustomerEmail {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO
  status: EmailStatus;
}

export interface ExtractionResult {
  orderNumber: string | null;
  customerName: string | null;
  email: string;
}

export interface OrderLineItem {
  title: string;
  quantity: number;
  price: string;
}

export interface ShopifyOrderSummary {
  id: number;
  name: string; // z. B. "#1042"
  createdAt: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  totalPrice: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  trackingNumbers: string[];
  trackingUrls: string[];
  lineItems: OrderLineItem[];
  matchedBy: "bestellnummer" | "email" | "name";
}

export interface AnalysisResult {
  extraction: ExtractionResult;
  order: ShopifyOrderSummary | null;
  draft: string;
  draftSubject: string;
  needsMoreInfo: boolean;
}
