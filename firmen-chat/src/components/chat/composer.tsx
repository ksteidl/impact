"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon, FileTextIcon, PaperclipIcon, SquareIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PrivacyBadge } from "./model-picker"
import type { ChatModel } from "@/lib/types"

export type Attachment = { name: string; text: string; size: number }
const MAX_FILE = 500 * 1024
const ACCEPT = ".txt,.md,.csv,.json,.xml,.html,.log,.yaml,.yml,.js,.ts,.tsx,.py,.java,.cs,.sql,.sh,.css,.ini,.toml,text/*"

export function Composer({
  model,
  busy,
  disabled,
  onSend,
  onStop,
  autoFocusKey,
  prefill,
}: {
  model?: ChatModel
  busy: boolean
  disabled?: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  autoFocusKey?: unknown
  prefill?: { text: string; n: number }
}) {
  const [text, setText] = useState("")
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [autoFocusKey])

  // Vorschlag aus der Startseite übernehmen (abgeleiteter Zustand, kein Effekt nötig)
  const [seenPrefill, setSeenPrefill] = useState(prefill?.n)
  if (prefill && prefill.n !== seenPrefill) {
    setSeenPrefill(prefill.n)
    setText(prefill.text)
  }
  useEffect(() => {
    const t = ref.current
    if (!prefill || !t) return
    t.focus()
    t.setSelectionRange(t.value.length, t.value.length)
  }, [prefill])

  useEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = "auto"
    t.style.height = `${Math.min(t.scrollHeight, 240)}px`
  }, [text])

  async function addFiles(list: File[]) {
    const out: Attachment[] = []
    for (const f of list) {
      if (f.size > MAX_FILE) {
        toast.error(`${f.name}: Datei zu groß (max. 500 KB).`)
        continue
      }
      const content = await f.text()
      if (content.slice(0, 2000).includes("\u0000")) {
        toast.error(`${f.name}: Nur Textdateien werden unterstützt.`)
        continue
      }
      out.push({ name: f.name, text: content, size: f.size })
    }
    setFiles((prev) => [...prev, ...out])
  }

  function submit() {
    if (busy || disabled || (!text.trim() && !files.length)) return
    onSend(text.trim(), files)
    setText("")
    setFiles([])
  }

  return (
    <div
      className={`relative rounded-2xl border bg-card shadow-lg shadow-black/[0.03] transition-colors focus-within:border-ring/60 focus-within:ring-4 focus-within:ring-ring/10 dark:shadow-black/30 ${dragging ? "border-primary ring-4 ring-primary/15" : ""}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files])
      }}
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1.5 pr-1.5 pl-2.5 text-sm">
              <FileTextIcon className="size-4 text-primary" />
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                aria-label={`${f.name} entfernen`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        onPaste={(e) => {
          const pasted = [...e.clipboardData.files]
          if (pasted.length) {
            e.preventDefault()
            addFiles(pasted)
          }
        }}
        placeholder={disabled ? "Für Ihr Konto ist noch kein Modell freigegeben." : "Nachricht an den Assistenten …"}
        aria-label="Nachricht"
        className="block max-h-60 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <div className="flex items-center gap-2 px-2.5 pb-2.5">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ""
          }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              aria-label="Datei anhängen"
            >
              <PaperclipIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Textdatei anhängen (auch per Drag &amp; Drop)</TooltipContent>
        </Tooltip>
        <PrivacyBadge model={model} />
        <div className="ml-auto">
          {busy ? (
            <Button size="icon" className="size-8 rounded-full" onClick={onStop} aria-label="Antwort stoppen">
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-8 rounded-full"
              onClick={submit}
              disabled={disabled || (!text.trim() && !files.length)}
              aria-label="Senden"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
