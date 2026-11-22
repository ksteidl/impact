"use client"

import { memo, useState, type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { CheckIcon, CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

function textOf(node: unknown): string {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: unknown } }).props.children)
  return ""
}

function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false)
  const code = textOf(children)
  const child = Array.isArray(children) ? children[0] : children
  const cls = (child as { props?: { className?: string } })?.props?.className || ""
  const lang = /language-([\w-]+)/.exec(cls)?.[1] ?? "text"
  return (
    <div className="group/code my-4 overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{lang}</span>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={async () => {
            await navigator.clipboard.writeText(code.replace(/\n$/, ""))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
      <pre {...props} className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
        {children}
      </pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true }]]}
        // Kein Roh-HTML (Standard), nur sichere Links
        urlTransform={(url) => (/^(https?:|mailto:|#)/i.test(url) ? url : "")}
        components={{
          pre: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
