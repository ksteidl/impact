# Firmen-Chat

Firmen-Chat ist ein selbst gehostetes KI-Chat-Portal für Mitarbeiter, das vollständig vom Arbeitgeber verwaltet wird.
Es läuft auf Ihrem eigenen Server und bindet die Modelle der großen Anbieter über deren API an, auf Wunsch auch lokale Modelle, die das Firmennetz nie verlassen.

## Funktionen

**Für Mitarbeiter**
- Chat mit Streaming-Antworten, Markdown, Tabellen und Codeblöcken mit Kopier-Button
- Modellauswahl: lokale Modelle sind mit 🔒 gekennzeichnet, externe mit „Extern“
- Gespeicherte Chats lassen sich durchsuchen, umbenennen und löschen
- Textdateien (.txt, .md, .csv, .json, Code …) können angehängt werden, per Klick, Drag & Drop oder Einfügen
- Das eigene Tageskontingent wird angezeigt
- Läuft im Hell- und Dunkelmodus und auf dem Handy

**Für den Arbeitgeber (Verwaltung unter `/admin`)**

| Bereich | Möglichkeiten |
|---|---|
| **Anbieter** | Vorlagen für OpenAI, Anthropic (Claude), Google Gemini, Mistral, xAI, DeepSeek, Groq, OpenRouter, Together, Perplexity, Azure OpenAI, Ollama, vLLM/LM Studio sowie jeden OpenAI-kompatiblen Endpunkt. API-Schlüssel werden mit AES-256-GCM verschlüsselt gespeichert und nie wieder angezeigt. Ein Verbindungstest ist eingebaut. |
| **Modelle** | Über „Modelle abrufen“ werden alle Modelle eines Anbieters aufgelistet und lassen sich per Klick übernehmen. Pro Modell einstellbar: aktiv/inaktiv, Anzeigename, Beschreibung, Freigabe für bestimmte Abteilungen, maximale Antwortlänge, Denkaufwand (Effort). |
| **Benutzer** | Konten anlegen, sperren und löschen; Rollen (Mitarbeiter/Administrator); Abteilung; Passwort zurücksetzen; individuelles Token-Limit. |
| **Richtlinien** | Automatisches Schwärzen personenbezogener Daten vor externen Anbietern, eigene Begriffslisten zum Schwärzen und Sperren, Speicherung von Chats ein/aus, Aufbewahrungsfristen, Standard-Tageslimit, unternehmensweiter System-Prompt, Hinweisbanner. |
| **Übersicht** | Nutzung nach Tag, Modell und Benutzer (Anfragen, Tokens, Schwärzungen, Fehler) mit CSV-Export für Kostenstellen. |
| **Protokoll** | Audit-Log aller Anmeldungen und Verwaltungsaktionen. |

> **Datenschutz für Mitarbeiter:** Die Verwaltung sieht nur Metadaten (wer, wann, welches Modell, wie viele Tokens).
> Chat-Inhalte sind für Administratoren in der Oberfläche **nicht** einsehbar.
> Das erleichtert die Abstimmung mit Betriebsrat bzw. Personalvertretung (Leistungs- und Verhaltenskontrolle).

## Datenfluss

```
Mitarbeiter-Browser ──HTTPS──► Reverse-Proxy ──► Firmen-Chat (Ihr Server, SQLite in /data)
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
          🔒 Lokale Modelle (Ollama, vLLM …)              Externe APIs (Anthropic, OpenAI, Gemini …)
          Daten bleiben im Firmennetz                      ← nur nach DLP-Filter (Schwärzung)
                                                           ← API-Schlüssel nur am Server, nie im Browser
```

- Mitarbeiter haben **keinen** direkten Zugriff auf API-Schlüssel oder Anbieter.
- Vor jedem Aufruf eines externen Anbieters prüft der Server Freigabe, Kontingent und gesperrte Begriffe und schwärzt E-Mail-Adressen, Telefonnummern, IBAN, Kreditkartennummern, Sozialversicherungsnummern und eigene Begriffe. Im Chat wird angezeigt, wie viele Angaben geschwärzt wurden.
- Die Originalnachricht wird nur lokal gespeichert, sofern die Speicherung aktiviert ist.

## Schnellstart (Docker)

Sie brauchen einen Linux-Server oder eine VM mit Docker. Für lokale Modelle ist eine GPU empfehlenswert.

```bash
cd firmen-chat
cp .env.example .env
```

In `.env` einen geheimen Schlüssel eintragen:

```bash
echo "APP_SECRET=$(openssl rand -base64 48)" >> .env
```

```bash
docker compose up -d
```

Das Einmal-Passwort des ersten Administrators steht im Log (sofern `ADMIN_PASSWORD` nicht gesetzt ist):

```bash
docker compose logs firmen-chat
```

Danach `http://localhost:3000` öffnen, anmelden und das Passwort ändern.
Weiter geht es in der Verwaltung: **Anbieter hinzufügen → Modelle abrufen → übernehmen → Benutzer anlegen.**

### Mit lokalem Modell (Ollama)

```bash
docker compose --profile lokal up -d
```

```bash
docker compose exec ollama ollama pull llama3.3
```

In der Verwaltung dann die Vorlage „Ollama (lokal, im Firmennetz)“ wählen (Basis-URL `http://ollama:11434/v1`) und „Modelle abrufen“ klicken.

### Ohne Docker

Voraussetzung ist Node.js 22.13 oder neuer.

```bash
npm ci --omit=dev
```

```bash
APP_SECRET="$(openssl rand -base64 48)" DATA_DIR=/var/lib/firmen-chat npm start
```

## HTTPS / Reverse-Proxy

Die Anwendung lauscht in Docker nur auf `127.0.0.1:3000`. Stellen Sie einen Reverse-Proxy mit TLS davor, zum Beispiel Caddy (`/etc/caddy/Caddyfile`):

```
chat.firma.intern {
    reverse_proxy 127.0.0.1:3000
    tls internal          # oder Ihr Firmenzertifikat
}
```

Setzen Sie dazu `TRUST_PROXY=1`, damit Cookies als `Secure` markiert und echte Client-IPs protokolliert werden.
Bei nginx `proxy_buffering off;` für `/api/chat` setzen, damit das Streaming funktioniert.

## Anbieter einrichten

| Anbieter | Protokoll | Basis-URL (Vorlage füllt sie aus) | Beispiel-Modelle |
|---|---|---|---|
| Anthropic | Anthropic | *(leer)* | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2` |
| OpenAI | OpenAI | *(leer)* | über „Modelle abrufen“ |
| Azure OpenAI | Azure | `https://<ressource>.openai.azure.com` | Deployment-Name als Modell-ID |
| Google Gemini | OpenAI-kompatibel | `https://generativelanguage.googleapis.com/v1beta/openai/` | über „Modelle abrufen“ |
| Mistral (EU) | OpenAI-kompatibel | `https://api.mistral.ai/v1` | über „Modelle abrufen“ |
| xAI, DeepSeek, Groq, OpenRouter, Together, Perplexity | OpenAI-kompatibel | siehe Vorlage | über „Modelle abrufen“ |
| Ollama / vLLM / LM Studio | OpenAI-kompatibel, **lokal** | z. B. `http://ollama:11434/v1` | `llama3.3`, `qwen3`, `mistral-small` … |

Neue Modelle, die ein Anbieter später veröffentlicht, erscheinen automatisch unter „Modelle abrufen“. Ein Code-Update ist dafür nicht nötig.

**Hinweise zu Claude:** Bei `claude-fable-5-2`, `claude-fable-5-1`, `claude-opus-5-5`, `claude-opus-5` und `claude-sonnet-5-5` ist der serverseitige Refusal-Fallback von Anthropic aktiviert.
Lehnt das Modell eine Anfrage aus Sicherheitsgründen ab, beantwortet die API sie automatisch mit einem passenden Ersatzmodell. Der Chat zeigt dann einen Hinweis an.
Das gilt nur bei direkter Anbindung an Anthropic (Basis-URL leer).
Den Denkaufwand steuert das Feld „Effort“ am Modell. Leer bedeutet den Standard des Modells; für einen schnellen Alltags-Chat eignet sich `low`.

## Sicherheit

- Passwörter werden mit scrypt gehasht. Eine Passwortrichtlinie gilt, und beim ersten Login muss das Passwort geändert werden.
- Nach 5 Fehlversuchen wird die Anmeldung für 15 Minuten gesperrt.
- Sitzungs-Cookies sind `HttpOnly` und `SameSite=Strict` (hinter TLS zusätzlich `Secure`). Sitzungs-IDs werden nur gehasht gespeichert.
- CSRF-Schutz über Origin-Prüfung, einen Pflicht-Header und ausschließlich JSON-Anfragen.
- Strikte Content-Security-Policy ohne Inline-Skripte und ohne externe Quellen (keine CDNs). Modellantworten werden HTML-escaped gerendert.
- API-Schlüssel sind mit AES-256-GCM verschlüsselt (Schlüssel aus `APP_SECRET`) und gelangen nie in den Browser.
- Der Container läuft ohne Root, mit schreibgeschütztem Dateisystem und ohne Linux-Capabilities.
- Der CSV-Export ist gegen Formel-Injection geschützt.
- Es gibt nur drei Laufzeit-Abhängigkeiten (`express`, `@anthropic-ai/sdk`, `openai`). Die Datenbank ist das in Node.js eingebaute SQLite.

## Betrieb

- **Backup:** das Volume `/data` sichern (`firmen-chat.db*`). Den `APP_SECRET` getrennt davon aufbewahren.
- **Aufbewahrung:** Abgelaufene Chats, Sitzungen und Protokolle werden stündlich gelöscht (Fristen unter „Richtlinien“).
- **Update:**
  ```bash
  git pull && docker compose up -d --build
  ```
- **Tests:**
  ```bash
  npm test
  ```

## Rechtliche Checkliste (DSGVO), keine Rechtsberatung

1. Auftragsverarbeitungsvertrag (AVV/DPA) mit jedem externen Anbieter abschließen. Prüfen, ob eine Verarbeitung in der EU möglich ist (z. B. Azure OpenAI in EU-Regionen oder Mistral) und welche Aufbewahrung bzw. Zero-Data-Retention der Anbieter zusagt.
2. Betriebsvereinbarung mit dem Betriebsrat zur Nutzung und Protokollierung abschließen.
3. Verarbeitungsverzeichnis ergänzen und eine Datenschutz-Folgenabschätzung prüfen.
4. Nutzungsrichtlinie für Mitarbeiter: Welche Daten dürfen an welche Modelle? Der Hinweisbanner kann darauf verweisen.
5. Für besonders sensible Abteilungen (HR, Recht) nur lokale 🔒-Modelle freigeben, über das Feld „Freigegeben für Abteilungen“ am Modell.

## Grenzen der aktuellen Version

- Anmeldung mit lokalen Konten. Single Sign-On (Entra ID/Azure AD, LDAP, OIDC) ist der naheliegende nächste Ausbauschritt.
- Dateianhänge nur als Text. Bilder und PDFs werden noch nicht an die Modelle übergeben.
- Modelle, die nur über die OpenAI-„Responses“-API erreichbar sind, werden nicht unterstützt (die übrigen OpenAI-Modelle schon).
- Die Schwärzung ist musterbasiert und ersetzt keine Sensibilisierung der Mitarbeiter. Namen von Personen werden nur erkannt, wenn sie in der Begriffsliste stehen.
