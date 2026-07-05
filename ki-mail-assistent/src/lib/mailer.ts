import type { CustomerEmail } from "./types";
import { demoEmails } from "./demo-data";

const isDemo = () => process.env.DEMO_MODE === "true";

/** Ungelesene E-Mails aus dem IMAP-Posteingang laden. */
export async function fetchInbox(): Promise<CustomerEmail[]> {
  if (isDemo()) return demoEmails;

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      user: process.env.MAIL_USER!,
      pass: process.env.MAIL_PASSWORD!,
    },
    logger: false,
  });

  const emails: CustomerEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Die letzten 25 Nachrichten laden (neueste zuerst)
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return [];
      const from = Math.max(1, total - 24);

      for await (const msg of client.fetch(`${from}:${total}`, {
        source: true,
        uid: true,
        flags: true,
      })) {
        const parsed = await simpleParser(msg.source!);
        const fromAddr = parsed.from?.value?.[0];
        emails.push({
          id: String(msg.uid),
          from: fromAddr?.address ?? "unbekannt",
          fromName: fromAddr?.name ?? "",
          subject: parsed.subject ?? "(kein Betreff)",
          body: (parsed.text ?? "").trim(),
          receivedAt: (parsed.date ?? new Date()).toISOString(),
          status: msg.flags?.has("\\Answered") ? "gesendet" : "neu",
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return emails.reverse();
}

/** Freigegebene Antwort per SMTP versenden. */
export async function sendReply(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (isDemo()) {
    // Im Demo-Modus wird nichts wirklich versendet.
    await new Promise((r) => setTimeout(r, 600));
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: {
      user: process.env.MAIL_USER!,
      pass: process.env.MAIL_PASSWORD!,
    },
  });

  await transporter.sendMail({
    from: `"${process.env.STORE_NAME ?? "Shop"}" <${process.env.MAIL_USER}>`,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });
}
