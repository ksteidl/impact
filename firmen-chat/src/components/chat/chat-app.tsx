"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { InfoIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ConfirmDialog, PasswordDialog, PromptDialog } from "@/components/app/dialogs"
import { api } from "@/lib/api"
import type { ChatMessage, ChatModel, ConversationSummary, Me } from "@/lib/types"
import { ChatSidebar } from "./chat-sidebar"
import { ModelPicker } from "./model-picker"
import { Message } from "./message"
import { Composer, type Attachment } from "./composer"
import { EmptyState } from "./empty-state"

type Initial = { id: string; model_ref: number | null; messages: ChatMessage[] } | null

// Zuletzt gewähltes Modell merken (Cookie, damit der Server es beim Rendern kennt)
const rememberModel = (id: number) => {
  document.cookie = `fc_model=${id}; path=/; max-age=31536000; samesite=strict`
}

export function ChatApp({
  me: initialMe,
  models,
  conversations: initialConversations,
  initial,
  preferredModel,
}: {
  me: Me
  models: ChatModel[]
  conversations: ConversationSummary[]
  initial: Initial
  preferredModel: number | null
}) {
  const router = useRouter()
  const [me, setMe] = useState(initialMe)
  const [conversations, setConversations] = useState(initialConversations)
  const [convId, setConvId] = useState<string | null>(initial?.id ?? null)
  const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages ?? [])
  const [modelId, setModelId] = useState<number | null>(() => {
    for (const id of [initial?.model_ref, preferredModel]) if (id && models.some((m) => m.id === id)) return id
    return models[0]?.id ?? null
  })
  const [busy, setBusy] = useState(false)
  const [prefill, setPrefill] = useState<{ text: string; n: number }>()
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null)
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [bannerHidden, setBannerHidden] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  const model = models.find((m) => m.id === modelId)

  // Automatisch mitscrollen, solange der Nutzer unten ist
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setConvId(null)
    setMessages([])
    window.history.pushState(null, "", "/")
  }, [])

  async function openConversation(id: string) {
    if (busy) return toast.info("Bitte warten, bis die Antwort fertig ist.")
    try {
      const conv = await api<{ id: string; model_ref: number | null; messages: ChatMessage[] }>(`/api/conversations/${encodeURIComponent(id)}`)
      setConvId(conv.id)
      setMessages(conv.messages)
      if (conv.model_ref && models.some((m) => m.id === conv.model_ref)) setModelId(conv.model_ref)
      stickRef.current = true
      window.history.pushState(null, "", `/c/${conv.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function send(text: string, files: Attachment[]) {
    if (!model) return
    let content = text
    for (const f of files) content += `\n\n--- Datei: ${f.name} ---\n\`\`\`\n${f.text}\n\`\`\``
    content = content.trim()
    const history = me.storeChats ? undefined : messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))

    stickRef.current = true
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "", model_label: model.name }])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = fn(copy[copy.length - 1])
        return copy
      })
    const patchUser = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 2] = fn(copy[copy.length - 2])
        return copy
      })
    const notes: string[] = []
    let isError = false
    let buffer = ""
    let raf = 0
    const flush = () => {
      raf = 0
      const chunk = buffer
      buffer = ""
      if (chunk) patchLast((m) => ({ ...m, content: m.content + chunk }))
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "firmen-chat" },
        body: JSON.stringify({ modelId: model.id, message: content, conversationId: convId, history }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) router.replace("/login")
        throw new Error(data.error || `Fehler ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          if (!line.startsWith("data: ")) continue
          const ev = JSON.parse(line.slice(6))
          if (ev.type === "start") {
            if (ev.conversationId && !convId) {
              setConvId(ev.conversationId)
              setConversations((prev) => [{ id: ev.conversationId, title: ev.title, model_ref: model.id, updated_at: Date.now() }, ...prev])
              window.history.replaceState(null, "", `/c/${ev.conversationId}`)
            }
            if (ev.redactions > 0) patchUser((m) => ({ ...m, redactions: ev.redactions }))
          } else if (ev.type === "delta") {
            buffer += ev.text
            if (!raf) raf = requestAnimationFrame(flush)
          } else if (ev.type === "notice") notes.push(ev.text)
          else if (ev.type === "error") {
            isError = true
            notes.push(ev.error)
          } else if (ev.type === "done") {
            const used = (ev.usage?.input || 0) + (ev.usage?.output || 0)
            setMe((m) => ({ ...m, usageToday: m.usageToday + used }))
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") notes.push("Antwort wurde gestoppt.")
      else {
        isError = true
        notes.push((e as Error).message)
      }
    } finally {
      if (raf) cancelAnimationFrame(raf)
      flush()
      patchLast((m) => ({ ...m, notes, error: isError && !m.content }))
      setBusy(false)
      abortRef.current = null
      setConversations((prev) => {
        const id = convIdRef.current
        const c = prev.find((x) => x.id === id)
        return c ? [{ ...c, updated_at: Date.now() }, ...prev.filter((x) => x.id !== id)] : prev
      })
    }
  }

  // aktuelle Unterhaltungs-ID für den finally-Block
  const convIdRef = useRef(convId)
  useEffect(() => {
    convIdRef.current = convId
  }, [convId])

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {})
    router.replace("/login")
    router.refresh()
  }

  const showBanner = !!me.bannerText && !bannerHidden

  return (
    <SidebarProvider>
      <ChatSidebar
        me={me}
        conversations={conversations}
        activeId={convId}
        onSelect={openConversation}
        onNew={newChat}
        onRename={setRenaming}
        onDelete={setDeleting}
        onChangePassword={() => setPwOpen(true)}
        onLogout={logout}
      />
      <SidebarInset className="fc-glow flex h-svh flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-md">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <ModelPicker
            models={models}
            value={modelId}
            onChange={(id) => {
              setModelId(id)
              rememberModel(id)
            }}
          />
        </header>

        {showBanner && (
          <div className="flex items-center gap-2 border-b bg-warning/10 px-4 py-2 text-sm text-foreground/80">
            <InfoIcon className="size-4 shrink-0 text-warning" />
            <span className="flex-1">{me.bannerText}</span>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setBannerHidden(true)} aria-label="Hinweis ausblenden">
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="flex flex-1 flex-col overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState name={me.displayName} onPick={(text) => setPrefill({ text, n: Date.now() })} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
              {messages.map((m, i) => (
                <Message key={i} msg={m} streaming={busy && i === messages.length - 1} />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              model={model}
              busy={busy}
              disabled={!model}
              onSend={send}
              onStop={() => abortRef.current?.abort()}
              autoFocusKey={convId}
              prefill={prefill}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              KI kann Fehler machen – wichtige Angaben bitte prüfen.
              {me.storeChats
                ? me.retentionDays
                  ? ` Chats werden nach ${me.retentionDays} Tagen Inaktivität gelöscht.`
                  : ""
                : " Chats werden nicht gespeichert."}
            </p>
          </div>
        </div>
      </SidebarInset>

      <PromptDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Chat umbenennen"
        label="Titel"
        initial={renaming?.title ?? ""}
        onSubmit={async (title) => {
          await api(`/api/conversations/${encodeURIComponent(renaming!.id)}`, { method: "PATCH", body: { title } })
          setConversations((prev) => prev.map((c) => (c.id === renaming!.id ? { ...c, title } : c)))
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Chat löschen?"
        description={`„${deleting?.title}“ wird endgültig gelöscht.`}
        onConfirm={async () => {
          await api(`/api/conversations/${encodeURIComponent(deleting!.id)}`, { method: "DELETE" })
          setConversations((prev) => prev.filter((c) => c.id !== deleting!.id))
          if (deleting!.id === convId) newChat()
          toast.success("Chat gelöscht.")
        }}
      />
      <PasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </SidebarProvider>
  )
}
