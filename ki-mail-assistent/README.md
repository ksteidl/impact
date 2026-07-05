# Postraum – KI-E-Mail-Assistent für Shopify

Beantwortet Kundenanfragen automatisch mit KI und verknüpft sie mit deinen Shopify-Bestelldaten. **Es wird nie automatisch gesendet** – jede Antwort wird erst nach deiner Freigabe verschickt.

## Funktionsweise

1. **Posteingang laden** – Die App holt Kunden-E-Mails per IMAP aus deinem Support-Postfach.
2. **Erkennung** – Aus Betreff und Text werden Bestellnummer (z. B. `#1042`), Kundenname (Absender oder Grußformel) und E-Mail-Adresse extrahiert.
3. **Shopify-Abgleich** – Die Bestellung wird in dieser Reihenfolge gesucht: Bestellnummer → E-Mail-Adresse → Kundenname.
4. **KI-Entwurf** – Claude erstellt eine deutsche Antwort auf Basis der echten Bestelldaten (Status, Artikel, Sendungsverfolgung). Wird keine Bestellung gefunden, formuliert die KI stattdessen eine höfliche Rückfrage nach Bestellnummer oder E-Mail-Adresse.
5. **Freigabe** – Du kannst den Entwurf direkt bearbeiten oder per Anweisung überarbeiten lassen („kürzer formulieren“, „Gutschein anbieten“ …). Erst mit **„Freigeben & senden“** geht die Antwort per SMTP raus.

## Schnellstart (Demo-Modus, ohne Zugangsdaten)

```bash
npm install
cp .env.example .env    # DEMO_MODE=true ist bereits gesetzt
npm run dev
```

Dann http://localhost:3000 öffnen. Die App läuft mit vier Beispiel-E-Mails und fiktiven Bestellungen – ideal, um den kompletten Ablauf zu testen.

## Produktivbetrieb

In der `.env` `DEMO_MODE=false` setzen und alle Werte ausfüllen:

| Variable | Beschreibung |
| --- | --- |
| `ANTHROPIC_API_KEY` | API-Key von https://console.anthropic.com |
| `ANTHROPIC_MODEL` | Modell für die Antworten (Standard: `claude-sonnet-4-6`) |
| `SHOPIFY_SHOP_DOMAIN` | z. B. `mein-shop.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin-API-Token einer Custom App (Scopes: `read_orders`, `read_customers`) |
| `IMAP_HOST` / `IMAP_PORT` | Posteingangsserver (z. B. `imap.gmail.com` / `993`) |
| `SMTP_HOST` / `SMTP_PORT` | Postausgangsserver (z. B. `smtp.gmail.com` / `465`) |
| `MAIL_USER` / `MAIL_PASSWORD` | Postfach-Zugang (bei Gmail: App-Passwort verwenden) |
| `STORE_NAME` / `STORE_SIGNATURE_NAME` | Shop-Name und Name in der Signatur |

**Shopify-Token erstellen:** Shopify-Admin → Einstellungen → Apps und Vertriebskanäle → Apps entwickeln → App erstellen → Admin-API-Scopes `read_orders` und `read_customers` aktivieren → installieren → Token kopieren.

## Technik

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** mit shadcn-artigen UI-Komponenten (`src/components/ui`)
- **@anthropic-ai/sdk** für die KI-Entwürfe
- **Shopify Admin REST API** für Bestell- und Kundendaten
- **imapflow + mailparser** (Empfang), **nodemailer** (Versand)

```
src/
  app/
    page.tsx              Dashboard (Posteingang · E-Mail · KI-Antwort)
    api/emails            GET  – Posteingang laden
    api/analyze           POST – Erkennung + Shopify-Suche + Entwurf
    api/refine            POST – Entwurf per Anweisung überarbeiten
    api/send              POST – freigegebene Antwort senden
  lib/
    parser.ts             Extraktion von Bestellnummer / Name / E-Mail
    shopify.ts            Bestellsuche über die Admin API
    claude.ts             Entwurf erstellen & überarbeiten
    mailer.ts             IMAP-Empfang & SMTP-Versand
    demo-data.ts          Beispieldaten für den Demo-Modus
```

## Hinweise

- Gesendete Antworten werden aktuell nur im laufenden Browser-Zustand als „gesendet“ markiert. Für dauerhafte Markierung könnte man das IMAP-Flag `\Answered` setzen oder eine kleine Datenbank ergänzen.
- Die KI erhält die Anweisung, keine Zusagen zu erfinden, die nicht aus den Bestelldaten hervorgehen – der Entwurf sollte trotzdem immer gegengelesen werden (dafür ist die Freigabe da).
