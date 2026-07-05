import type { ExtractionResult, ShopifyOrderSummary } from "./types";
import { findDemoOrder } from "./demo-data";

const isDemo = () => process.env.DEMO_MODE === "true";

interface RawOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  email: string;
  customer?: { first_name?: string; last_name?: string };
  fulfillments?: { tracking_numbers?: string[]; tracking_urls?: string[] }[];
  line_items: { title: string; quantity: number; price: string }[];
}

async function shopifyGet(path: string): Promise<any> {
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION ?? "2024-10";
  if (!domain || !token) {
    throw new Error(
      "Shopify-Zugangsdaten fehlen (SHOPIFY_SHOP_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN)."
    );
  }
  const res = await fetch(`https://${domain}/admin/api/${version}/${path}`, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Shopify API Fehler ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function toSummary(
  o: RawOrder,
  matchedBy: ShopifyOrderSummary["matchedBy"]
): ShopifyOrderSummary {
  return {
    id: o.id,
    name: o.name,
    createdAt: o.created_at,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    totalPrice: o.total_price,
    currency: o.currency,
    customerName: [o.customer?.first_name, o.customer?.last_name]
      .filter(Boolean)
      .join(" "),
    customerEmail: o.email ?? "",
    trackingNumbers:
      o.fulfillments?.flatMap((f) => f.tracking_numbers ?? []) ?? [],
    trackingUrls: o.fulfillments?.flatMap((f) => f.tracking_urls ?? []) ?? [],
    lineItems: o.line_items.map((li) => ({
      title: li.title,
      quantity: li.quantity,
      price: li.price,
    })),
    matchedBy,
  };
}

/**
 * Sucht die passende Bestellung – in dieser Reihenfolge:
 * 1. Bestellnummer  2. E-Mail-Adresse  3. Kundenname
 */
export async function findOrder(
  extraction: ExtractionResult
): Promise<ShopifyOrderSummary | null> {
  if (isDemo()) return findDemoOrder(extraction);

  // 1) Bestellnummer
  if (extraction.orderNumber) {
    const data = await shopifyGet(
      `orders.json?status=any&name=${encodeURIComponent(extraction.orderNumber)}`
    );
    if (data.orders?.length) return toSummary(data.orders[0], "bestellnummer");
  }

  // 2) E-Mail-Adresse (neueste Bestellung zuerst)
  if (extraction.email) {
    const data = await shopifyGet(
      `orders.json?status=any&email=${encodeURIComponent(extraction.email)}&order=created_at+desc&limit=5`
    );
    if (data.orders?.length) return toSummary(data.orders[0], "email");
  }

  // 3) Kundenname → Kundensuche → letzte Bestellung
  if (extraction.customerName) {
    const data = await shopifyGet(
      `customers/search.json?query=${encodeURIComponent(extraction.customerName)}&limit=1`
    );
    const customer = data.customers?.[0];
    if (customer?.last_order_id) {
      const orderData = await shopifyGet(
        `orders/${customer.last_order_id}.json`
      );
      if (orderData.order) return toSummary(orderData.order, "name");
    }
  }

  return null;
}
