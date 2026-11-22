"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon, ShieldCheckIcon, SparklesIcon, TriangleAlertIcon, InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import type { ChatMessage } from "@/lib/types"

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label="Antwort kopieren"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          }}
        >
          {done ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{done ? "Kopiert" : "Kopieren"}</TooltipContent>
    </Tooltip>
  )
}

function Typing() {
  return (
    <div className="flex h-7 items-center gap-1" aria-label="Antwort wird erstellt">
      <span className="fc-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="fc-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="fc-dot size-1.5 rounded-full bg-muted-foreground" />
    </div>
  )
}

export function Message({ msg, streaming }: { msg: ChatMessage; streaming?: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap break-words text-foreground dark:bg-primary/20">
          {msg.content}
        </div>
        {!!msg.redactions && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-success" />
            {msg.redactions} personenbezogene Angabe{msg.redactions > 1 ? "n" : ""} vor dem Senden geschwärzt
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="group/msg flex gap-4">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
        <SparklesIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{msg.model_label || "Assistent"}</div>
        {msg.content ? <Markdown text={msg.content} /> : streaming ? <Typing /> : null}
        {msg.notes?.map((n, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
              msg.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-muted/50 text-muted-foreground"
            )}
          >
            {msg.error ? <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> : <InfoIcon className="mt-0.5 size-4 shrink-0" />}
            {n}
          </div>
        ))}
        {!streaming && msg.content && (
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>
    </div>
  )
}
