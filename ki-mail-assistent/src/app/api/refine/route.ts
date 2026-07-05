import { NextResponse } from "next/server";
import { refineDraft } from "@/lib/claude";
import type { CustomerEmail, ExtractionResult, ShopifyOrderSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, extraction, order, currentDraft, instruction } =
      (await req.json()) as {
        email: CustomerEmail;
        extraction: ExtractionResult;
        order: ShopifyOrderSummary | null;
        currentDraft: string;
        instruction: string;
      };

    if (!instruction?.trim()) {
      return NextResponse.json({ error: "Bitte eine Änderungsanweisung angeben." }, { status: 400 });
    }

    const draft = await refineDraft(email, extraction, order, currentDraft, instruction);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Überarbeitung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
