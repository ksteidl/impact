import { NextResponse } from "next/server";
import { fetchInbox } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const emails = await fetchInbox();
    return NextResponse.json({ emails, demo: process.env.DEMO_MODE === "true" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Posteingang konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
