import { NextResponse } from "next/server";
import { sendReply } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { to, subject, body } = (await req.json()) as {
      to: string;
      subject: string;
      body: string;
    };
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Empfänger, Betreff und Text sind erforderlich." }, { status: 400 });
    }
    await sendReply({ to, subject, body });
    return NextResponse.json({ ok: true, demo: process.env.DEMO_MODE === "true" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Versand fehlgeschlagen." },
      { status: 500 }
    );
  }
}
