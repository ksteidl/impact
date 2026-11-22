# Firmen-Chat

Firmen-Chat ist ein selbst gehostetes KI-Chat-Portal für Mitarbeiter, das der Arbeitgeber vollständig verwaltet.
Es läuft auf Ihrem eigenen Server und bindet die Modelle aller großen Anbieter über deren API an. Auf Wunsch kommen lokale Modelle hinzu, deren Daten das Firmennetz nie verlassen.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), SQLite (in Node.js eingebaut), offizielle SDKs von Anthropic und OpenAI.

## Funktionen

**Für Mitarbeiter**
- Moderne Chat-Oberfläche mit Streaming, Markdown, Tabellen und Syntax-Hervorhebung mit Kopier-Button
- Modellauswahl mit Suche; lokale Modelle (🔒) und externe Anbieter sind klar gekennzeichnet
- Chatverlauf nach Datum gruppiert, durchsuchbar, umbenennbar; jede Unterhaltung hat eine eigene URL (`/c/…`)
- Textdateien anhängen per Klick, Drag & Drop oder Einfügen
- Startseite mit Vorschlägen, Anzeige des Tageskontingents
- Hell-, Dunkel- und Systemmodus, auch auf dem Handy nutzbar

**Für den Arbeitgeber (`/admin`)**

| Bereich | Möglichkeiten |
|---|---|
| **Übersicht** | Kennzahlen, Token-Verbrauch als Diagramm, Nutzung nach Modell und Benutzer, Zeitraumwahl, CSV-Export |
| **Anbieter** | Vorlagen für Anthropic, OpenAI, Google Gemini, Azure OpenAI, Mistral, xAI, DeepSeek, Groq, OpenRouter, Ollama, vLLM/LM Studio und eigene Endpunkte. API-Schlüssel werden mit AES-256-GCM verschlüsselt und nie wieder angezeigt. Verbindungstest eingebaut. |
| **Modelle** | „Modelle abrufen“ listet alle Modelle eines Anbieters zur Übernahme per Klick. Pro Modell: aktiv/inaktiv, Anzeigename, Beschreibung, Freigabe nach Abteilung, maximale Antwortlänge, Denkaufwand (Effort). |
| **Benutzer** | Konten anlegen und sperren, Rollen, Abteilung, Passwort zurücksetzen, individuelles Tageslimit |
| **Richtlinien** | Automatische Schwärzung personenbezogener Daten, eigene Schwärz- und Sperrbegriffe, Chat-Speicherung ein/aus, Aufbewahrungsfristen, Standard-Tageslimit, System-Prompt, Hinweisbanner |
| **Protokoll** | Audit-Log aller Anmeldungen und Verwaltungsaktionen |

> **Datenschutz für Mitarbeiter:** Die Verwaltung sieht nur Metadaten (wer, wann, welches Modell, wie viele Tokens).
> Chat-Inhalte sind für Administratoren in der Oberfläche nicht einsehbar. Das erleichtert die Abstimmung mit Betriebsrat bzw. Personalvertretung.

## Datenfluss

```
Browser ──HTTPS──► Reverse-Proxy ──► Firmen-Chat (Ihr Server, SQLite unter /data)
                                       │
                 ┌─────────────────────┴──────────────────────┐
                 ▼                                            ▼
  🔒 Lokale Modelle (Ollama, vLLM …)            Externe APIs (Anthropic, OpenAI, Gemini …)
     Daten bleiben im Firmennetz                  ← erst nach Prüfung und Schwärzung
                                                  ← API-Schlüssel nur am Server
```

Vor jedem Aufruf eines externen Anbieters prüft der Server Modellfreigabe, Kontingent und gesperrte Begriffe.
Danach schwärzt er E-Mail-Adressen, Telefonnummern, IBAN, Kreditkarten- und Sozialversicherungsnummern sowie eigene Begriffe.
Der Chat zeigt an, wie viele Angaben geschwärzt wurden. Die Originalnachricht bleibt nur lokal gespeichert, sofern die Speicherung aktiviert ist.

## Schnellstart (Docker)

```bash
cd firmen-chat && cp .env.example .env
```

```bash
echo "APP_SECRET=$(openssl rand -base64 48)" >> .env
```

```bash
docker compose up -d --build
```

Das Einmal-Passwort des Administrators steht im Log, sofern `ADMIN_PASSWORD` nicht gesetzt ist:

```bash
docker compose logs firmen-chat
```

Danach `http://localhost:3000` öffnen, anmelden und ein eigenes Passwort festlegen.
Weiter in der Verwaltung: **Anbieter hinzufügen → Modelle abrufen → übernehmen → Benutzer anlegen.**

### Mit lokalem Modell (Ollama)

```bash
docker compose --profile lokal up -d --build
```

```bash
docker compose exec ollama ollama pull llama3.3
```

Anschließend in der Verwaltung die Vorlage „Ollama (lokal)“ wählen (Basis-URL `http://ollama:11434/v1`).

## Entwicklung

Voraussetzung ist Node.js 22.18 oder neuer.

```bash
npm install
```

```bash
npm run dev
```

Die Anwendung läuft dann unter `http://localhost:3000`. Daten liegen in `./data` (über `DATA_DIR` änderbar).

Prüfungen:

```bash
npm run typecheck && npm run lint && npm test
```

### Projektstruktur

```
src/
  app/                 Seiten (Chat, Login, /admin/*) und API-Routen (app/api/*)
  components/
    chat/              Chat-Oberfläche: Sidebar, Modellauswahl, Nachrichten, Eingabe
    admin/             Verwaltung: Übersicht, Modelle, Anbieter, Benutzer, Richtlinien
    ui/                shadcn/ui-Komponenten
  server/              Nur serverseitig: Datenbank, Sicherheit, Anbieter-Adapter, DLP
  proxy.ts             Content-Security-Policy mit Nonce, Weiterleitung zur Anmeldung
  instrumentation.ts   Erststart (Administrator anlegen) und Aufbewahrungsfristen
```

## HTTPS / Reverse-Proxy

Der Container lauscht nur auf `127.0.0.1:3000`. Davor gehört ein Reverse-Proxy mit TLS, zum Beispiel Caddy:

```
chat.firma.intern {
    reverse_proxy 127.0.0.1:3000
    tls internal          # oder Ihr Firmenzertifikat
}
```

Setzen Sie dazu `TRUST_PROXY=1`. Bei nginx zusätzlich `proxy_buffering off;` für `/api/chat`, damit das Streaming funktioniert.

## Anbieter

| Anbieter | Protokoll | Hinweis |
|---|---|---|
| Anthropic | Anthropic-API | Modelle z. B. `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2` |
| OpenAI | OpenAI-API | Modelle über „Modelle abrufen“ |
| Azure OpenAI | Azure | Deployment-Name als Modell-ID, EU-Regionen möglich |
| Google Gemini, Mistral, xAI, DeepSeek, Groq, OpenRouter, Together, Perplexity | OpenAI-kompatibel | Basis-URL füllt die Vorlage aus |
| Ollama, vLLM, LM Studio, LocalAI | OpenAI-kompatibel, **lokal** | z. B. `http://ollama:11434/v1` |

Neue Modelle eines Anbieters erscheinen automatisch unter „Modelle abrufen“. Ein Code-Update ist dafür nicht nötig.

**Claude:** Bei direkter Anbindung (Basis-URL leer) ist für `claude-fable-5-2`, `claude-fable-5-1`, `claude-opus-5-5`, `claude-opus-5` und `claude-sonnet-5-5` der serverseitige Refusal-Fallback von Anthropic aktiv.
Lehnt das Modell eine Anfrage aus Sicherheitsgründen ab, beantwortet die API sie mit einem passenden Ersatzmodell, und der Chat zeigt einen Hinweis.
Den Denkaufwand steuert das Feld „Denkaufwand“ am Modell; `low` eignet sich für schnelle Alltags-Chats.

## Sicherheit

- Passwörter werden mit scrypt gehasht. Es gilt eine Passwortrichtlinie, und beim ersten Login muss das Passwort geändert werden.
- Nach 5 Fehlversuchen wird die Anmeldung für 15 Minuten gesperrt.
- Sitzungs-Cookies sind `HttpOnly` und `SameSite=Strict` (hinter TLS zusätzlich `Secure`). Sitzungs-IDs werden nur gehasht gespeichert.
- CSRF-Schutz über Origin-Prüfung, einen Pflicht-Header und ausschließlich JSON-Anfragen.
- Content-Security-Policy mit Nonce pro Anfrage (`strict-dynamic`), ohne externe Quellen; Schriften werden lokal ausgeliefert.
- Modellantworten werden ohne Roh-HTML gerendert; Links sind nur mit `http(s)`/`mailto` erlaubt.
- Jede Admin-Seite und jede Admin-API prüft die Berechtigung selbst, nicht nur das Layout.
- API-Schlüssel sind mit AES-256-GCM verschlüsselt (Schlüssel aus `APP_SECRET`) und gelangen nie in den Browser.
- Der Container läuft ohne Root, mit schreibgeschütztem Dateisystem und ohne Linux-Capabilities; das Image enthält nur den kompilierten Server.
- Der CSV-Export ist gegen Formel-Injection geschützt.

## Betrieb

- **Backup:** das Volume `/data` sichern (`firmen-chat.db*`) und den `APP_SECRET` getrennt davon aufbewahren.
- **Aufbewahrung:** Abgelaufene Chats, Sitzungen und Protokolle werden stündlich gelöscht (Fristen unter „Richtlinien“).
- **Update:**
  ```bash
  git pull && docker compose up -d --build
  ```

## Rechtliche Checkliste (DSGVO), keine Rechtsberatung

1. Auftragsverarbeitungsvertrag (AVV/DPA) mit jedem externen Anbieter abschließen. Prüfen, ob eine Verarbeitung in der EU möglich ist (z. B. Azure OpenAI in EU-Regionen oder Mistral) und welche Aufbewahrung der Anbieter zusagt.
2. Betriebsvereinbarung mit dem Betriebsrat zur Nutzung und Protokollierung abschließen.
3. Verarbeitungsverzeichnis ergänzen und eine Datenschutz-Folgenabschätzung prüfen.
4. Nutzungsrichtlinie für Mitarbeiter erstellen; der Hinweisbanner kann darauf verweisen.
5. Für sensible Abteilungen (HR, Recht) nur lokale 🔒-Modelle freigeben, über „Freigegeben für Abteilungen“ am Modell.

## Grenzen der aktuellen Version

- Anmeldung mit lokalen Konten. Single Sign-On (Microsoft Entra ID, LDAP, OIDC) ist der naheliegende nächste Schritt.
- Dateianhänge nur als Text; Bilder und PDFs werden noch nicht an die Modelle übergeben.
- Modelle, die nur über die OpenAI-„Responses“-API erreichbar sind, werden nicht unterstützt.
- Die Schwärzung ist musterbasiert und ersetzt keine Sensibilisierung. Personennamen werden nur erkannt, wenn sie in der Begriffsliste stehen.
