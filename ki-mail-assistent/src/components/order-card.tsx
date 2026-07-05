import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ShopifyOrderSummary } from "@/lib/types";
import { Package, Truck, ExternalLink } from "lucide-react";

const financialLabels: Record<string, string> = {
  paid: "Bezahlt",
  pending: "Zahlung ausstehend",
  refunded: "Erstattet",
  partially_refunded: "Teilweise erstattet",
  authorized: "Autorisiert",
  voided: "Storniert",
};

const fulfillmentLabels: Record<string, string> = {
  fulfilled: "Versendet",
  partial: "Teilweise versendet",
  restocked: "Zurückgelegt",
};

export function OrderCard({ order }: { order: ShopifyOrderSummary }) {
  const fulfillment = order.fulfillmentStatus
    ? fulfillmentLabels[order.fulfillmentStatus] ?? order.fulfillmentStatus
    : "Noch nicht versendet";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-4 w-4 text-moss-700" aria-hidden />
          Bestellung <span className="font-mono">{order.name}</span>
        </CardTitle>
        <div className="flex gap-1.5">
          <Badge variant={order.financialStatus === "paid" ? "moss" : "amber"}>
            {financialLabels[order.financialStatus] ?? order.financialStatus}
          </Badge>
          <Badge variant={order.fulfillmentStatus === "fulfilled" ? "moss" : "amber"}>
            {fulfillment}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-ink/60">
          {order.customerName} · bestellt am{" "}
          {new Date(order.createdAt).toLocaleDateString("de-AT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </div>

        <ul className="divide-y divide-ink/[0.06] rounded-lg border border-ink/10">
          {order.lineItems.map((li, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-2">
              <span>
                <span className="font-mono text-ink/50">{li.quantity}×</span> {li.title}
              </span>
              <span className="font-mono text-ink/70">
                {Number(li.price).toLocaleString("de-AT", { minimumFractionDigits: 2 })} {order.currency}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between bg-ink/[0.02] px-3 py-2 font-medium">
            <span>Gesamt</span>
            <span className="font-mono">
              {Number(order.totalPrice).toLocaleString("de-AT", { minimumFractionDigits: 2 })} {order.currency}
            </span>
          </li>
        </ul>

        {order.trackingNumbers.length > 0 && (
          <div className="flex items-center gap-2 text-ink/70">
            <Truck className="h-4 w-4 text-moss-700" aria-hidden />
            <span className="font-mono">{order.trackingNumbers.join(", ")}</span>
            {order.trackingUrls[0] && (
              <a
                href={order.trackingUrls[0]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-moss-700 underline-offset-2 hover:underline"
              >
                Sendung verfolgen <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
