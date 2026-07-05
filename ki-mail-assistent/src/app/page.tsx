"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExtractionChips } from "@/components/extraction-chips";
import { OrderCard } from "@/components/order-card";
import type { AnalysisResult, CustomerEmail, EmailStatus } from "@/lib/types";
import {
  Inbox,
  RefreshCw,
  Sparkles,
  Send,
  Wand2,
  Mail,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type Analysis = AnalysisResult & { lookupError: string | null };

const statusMeta: Record<EmailStatus, { label: string; variant: "neutral" | "moss" | "amber" | "clay" }> = {
  neu: { label: "Neu", variant: "neutral" },
  entwurf: { label: "Entwurf bereit", variant: "moss" },
  info_fehlt: { label: "Infos fehlen", variant: "amber" },
  gesendet: { label: "Gesendet", variant: "moss" },
};

export default function Home() {
  const [emails, setEmails] = useState<CustomerEmail[]>([]);
  const [demo, setDemo] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, EmailStatus>>({});
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = useMemo(
    () => emails.find((e) => e.id === selectedId) ?? null,
    [emails, selectedId]
  );
  const analysis = selectedId ? analyses[selectedId] : undefined;
  const draft = selectedId ? drafts[selectedId] ?? "" : "";
  const subject = selectedId ? subjects[selectedId] ?? "" : "";
  const statusOf = (e: CustomerEmail): EmailStatus => statuses[e.id] ?? e.status;

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setError(null);
    try {
      const res = await fetch("/api/emails");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmails(data.emails);
      setDemo(data.demo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Posteingang konnte nicht geladen werden.");
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function analyze(email: CustomerEmail) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const a = data as Analysis;
      setAnalyses((prev) => ({ ...prev, [email.id]: a }));
      setDrafts((prev) => ({ ...prev, [email.id]: a.draft }));
      setSubjects((prev) => ({ ...prev, [email.id]: a.draftSubject }));
      setStatuses((prev) => ({
        ...prev,
        [email.id]: a.needsMoreInfo ? "info_fehlt" : "entwurf",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse fehlgeschlagen.");
    } finally {
      setAnalyzing(false);
    }
  }

  function selectEmail(email: CustomerEmail) {
    setSelectedId(email.id);
    setInstruction("");
    setError(null);
    if (!analyses[email.id] && statusOf(email) !== "gesendet") {
      analyze(email);
    }
  }

  async function refine() {
    if (!selected || !analysis || !instruction.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: selected,
          extraction: analysis.extraction,
          order: analysis.order,
          currentDraft: draft,
          instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDrafts((prev) => ({ ...prev, [selected.id]: data.draft }));
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Überarbeitung fehlgeschlagen.");
    } finally {
      setRefining(false);
    }
  }

  async function approveAndSend() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: selected.from, subject, body: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatuses((prev) => ({ ...prev, [selected.id]: "gesendet" }));
      setToast(
        data.demo
          ? "Demo-Modus: Antwort wurde als gesendet markiert (kein echter Versand)."
          : `Antwort an ${selected.from} gesendet.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versand fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  const openCount = emails.filter((e) => statusOf(e) !== "gesendet").length;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Kopfzeile */}
      <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-moss-700 text-white">
              <Mail className="h-4.5 w-4.5 h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold leading-tight">
                Postraum
              </h1>
              <p className="text-xs text-ink/50">
                KI-Antworten für Ihren Shopify-Kundenservice
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {demo && <Badge variant="amber">Demo-Modus</Badge>}
            <Badge variant="neutral">
              <Inbox className="h-3 w-3" /> {openCount} offen
            </Badge>
            <Button variant="secondary" size="sm" onClick={loadInbox} disabled={loadingInbox}>
              <RefreshCw className={loadingInbox ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Aktualisieren
            </Button>
          </div>
        </div>
      </header>

      {/* Fehlerbanner */}
      {error && (
        <div className="mx-auto max-w-[1400px] px-5 pt-4">
          <div className="flex items-start gap-2 rounded-lg border border-clay-700/25 bg-clay-50 px-3 py-2.5 text-sm text-clay-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Spalte 1: Posteingang */}
        <section aria-label="Posteingang" className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-ink/50">
            Posteingang
          </h2>
          {loadingInbox ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-ink/50">
                Keine neuen Kunden-E-Mails. Klicken Sie auf „Aktualisieren“, um das Postfach erneut abzurufen.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {emails.map((e) => {
                const st = statusOf(e);
                const active = e.id === selectedId;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => selectEmail(e)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-600 ${
                        active
                          ? "border-moss-600/40 bg-moss-50"
                          : "border-ink/10 bg-white hover:border-ink/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {e.fromName || e.from}
                        </span>
                        <Badge variant={statusMeta[st].variant}>{statusMeta[st].label}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-ink/70">{e.subject}</div>
                      <div className="mt-1 text-xs text-ink/40">
                        {new Date(e.receivedAt).toLocaleString("de-AT", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Spalte 2: Original-E-Mail */}
        <section aria-label="Kunden-E-Mail" className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-ink/50">
            Kunden-E-Mail
          </h2>
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-base">{selected.subject}</CardTitle>
                <p className="text-xs text-ink/50">
                  Von {selected.fromName ? `${selected.fromName} · ` : ""}
                  <span className="font-mono">{selected.from}</span>
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                  {selected.body}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-sm text-ink/50">
                Wählen Sie links eine E-Mail aus, um sie zu bearbeiten.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Spalte 3: KI-Antwort */}
        <section aria-label="KI-Antwort" className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-ink/50">
            KI-Antwort
          </h2>

          {!selected ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-ink/50">
                Hier erscheint der Antwortentwurf, sobald eine E-Mail ausgewählt ist.
              </CardContent>
            </Card>
          ) : analyzing ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-sm text-ink/60">
                  <Sparkles className="h-4 w-4 animate-pulse text-moss-700" aria-hidden />
                  E-Mail wird analysiert und Bestellung gesucht …
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          ) : analysis ? (
            <div className="space-y-3">
              <Card>
                <CardContent className="p-4">
                  <ExtractionChips extraction={analysis.extraction} order={analysis.order} />
                  {analysis.lookupError && (
                    <p className="mt-2 text-xs text-clay-700">
                      Shopify-Abfrage fehlgeschlagen: {analysis.lookupError}
                    </p>
                  )}
                </CardContent>
              </Card>

              {analysis.order && <OrderCard order={analysis.order} />}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-moss-700" aria-hidden />
                    Antwortentwurf
                    {analysis.needsMoreInfo && (
                      <Badge variant="amber">Rückfrage an Kunden</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label htmlFor="subject" className="mb-1 block text-xs font-medium text-ink/60">
                      Betreff
                    </label>
                    <Input
                      id="subject"
                      value={subject}
                      onChange={(ev) =>
                        setSubjects((prev) => ({ ...prev, [selected.id]: ev.target.value }))
                      }
                      disabled={statusOf(selected) === "gesendet"}
                    />
                  </div>
                  <div>
                    <label htmlFor="draft" className="mb-1 block text-xs font-medium text-ink/60">
                      Nachricht (direkt bearbeitbar)
                    </label>
                    <Textarea
                      id="draft"
                      value={draft}
                      rows={12}
                      onChange={(ev) =>
                        setDrafts((prev) => ({ ...prev, [selected.id]: ev.target.value }))
                      }
                      disabled={statusOf(selected) === "gesendet"}
                      className="font-body leading-relaxed"
                    />
                  </div>

                  {statusOf(selected) !== "gesendet" && (
                    <>
                      <div>
                        <label
                          htmlFor="instruction"
                          className="mb-1 block text-xs font-medium text-ink/60"
                        >
                          Änderung anfordern
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="instruction"
                            placeholder="z. B. kürzer formulieren, 10 % Gutschein anbieten …"
                            value={instruction}
                            onChange={(ev) => setInstruction(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") refine();
                            }}
                          />
                          <Button
                            variant="secondary"
                            onClick={refine}
                            disabled={refining || !instruction.trim()}
                          >
                            <Wand2 className={refining ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
                            {refining ? "Überarbeitet …" : "Überarbeiten"}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-ink/[0.06] pt-3">
                        <Button variant="ghost" size="sm" onClick={() => analyze(selected)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Neu generieren
                        </Button>
                        <Button onClick={approveAndSend} disabled={sending || !draft.trim()}>
                          <Send className="h-4 w-4" />
                          {sending ? "Wird gesendet …" : "Freigeben & senden"}
                        </Button>
                      </div>
                      <p className="text-xs text-ink/45">
                        Es wird nichts automatisch versendet – jede Antwort geht erst nach Ihrer
                        Freigabe raus.
                      </p>
                    </>
                  )}

                  {statusOf(selected) === "gesendet" && (
                    <div className="flex items-center gap-2 rounded-lg bg-moss-50 px-3 py-2.5 text-sm text-moss-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Diese Antwort wurde gesendet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Button onClick={() => analyze(selected)}>
                  <Sparkles className="h-4 w-4" />
                  Entwurf erstellen
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
