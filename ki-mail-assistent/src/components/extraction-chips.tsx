import { Badge } from "@/components/ui/badge";
import type { ExtractionResult, ShopifyOrderSummary } from "@/lib/types";
import { Hash, User, AtSign, ChevronRight, PackageCheck, PackageX } from "lucide-react";

/**
 * Die "Erkennungs-Pipeline": zeigt, welche Daten aus der Kunden-E-Mail
 * gelesen wurden und worüber die Bestellung in Shopify gefunden wurde.
 */
export function ExtractionChips({
  extraction,
  order,
}: {
  extraction: ExtractionResult;
  order: ShopifyOrderSummary | null;
}) {
  const chips: { icon: React.ReactNode; label: string; found: boolean; isMatch: boolean }[] = [
    {
      icon: <Hash className="h-3 w-3" />,
      label: extraction.orderNumber ?? "Keine Bestellnummer",
      found: !!extraction.orderNumber,
      isMatch: order?.matchedBy === "bestellnummer",
    },
    {
      icon: <AtSign className="h-3 w-3" />,
      label: extraction.email,
      found: true,
      isMatch: order?.matchedBy === "email",
    },
    {
      icon: <User className="h-3 w-3" />,
      label: extraction.customerName ?? "Kein Name erkannt",
      found: !!extraction.customerName,
      isMatch: order?.matchedBy === "name",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Erkannte Kundendaten">
      {chips.map((c, i) => (
        <Badge
          key={i}
          variant={c.isMatch ? "moss" : c.found ? "mono" : "neutral"}
          className={c.found ? "" : "opacity-50"}
        >
          {c.icon}
          <span className="max-w-[180px] truncate">{c.label}</span>
        </Badge>
      ))}
      <ChevronRight className="h-3.5 w-3.5 text-ink/30" aria-hidden />
      {order ? (
        <Badge variant="moss">
          <PackageCheck className="h-3 w-3" />
          Bestellung {order.name} gefunden
        </Badge>
      ) : (
        <Badge variant="amber">
          <PackageX className="h-3 w-3" />
          Keine Bestellung gefunden
        </Badge>
      )}
    </div>
  );
}
