import { NextResponse } from "next/server";
import { extractCustomerData } from "@/lib/parser";
import { findOrder } from "@/lib/shopify";
import { generateDraft } from "@/lib/claude";
import type { AnalysisResult, CustomerEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email: CustomerEmail };
    if (!email?.from || !email?.body) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    const extraction = extractCustomerData(email);

    let order = null;
    let lookupError: string | null = null;
    try {
      order = await findOrder(extraction);
    } catch (err) {
      lookupError = err instanceof Error ? err.message : "Shopify-Abfrage fehlgeschlagen.";
    }

    const draft = await generateDraft(email, extraction, order);

    const result: AnalysisResult & { lookupError: string | null } = {
      extraction,
      order,
      draft,
      draftSubject: email.subject.toLowerCase().startsWith("re:")
        ? email.subject
        : `Re: ${email.subject}`,
      needsMoreInfo: order === null,
      lookupError,
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analyse fehlgeschlagen." },
      { status: 500 }
    );
  }
}
