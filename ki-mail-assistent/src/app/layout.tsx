import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Postraum – KI-Antworten für Shopify-Kundenservice",
  description:
    "Beantwortet Kundenanfragen automatisch mit KI, verknüpft mit Ihren Shopify-Bestelldaten – jede Antwort wird vor dem Versand von Ihnen freigegeben.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
