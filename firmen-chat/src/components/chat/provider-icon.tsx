import { HardDriveIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProviderType } from "@/lib/types"

// Neutrale Anbieter-Kennzeichnung (Initialen statt Markenlogos).
const COLORS: [RegExp, string][] = [
  [/anthropic|claude/i, "from-orange-400 to-amber-600"],
  [/openai|gpt|azure/i, "from-emerald-400 to-teal-600"],
  [/gemini|google/i, "from-sky-400 to-blue-600"],
  [/mistral/i, "from-orange-500 to-red-600"],
  [/xai|grok/i, "from-zinc-500 to-zinc-800"],
  [/deepseek/i, "from-blue-500 to-indigo-700"],
  [/groq/i, "from-rose-400 to-pink-600"],
  [/openrouter|together|perplexity/i, "from-violet-400 to-purple-700"],
]

export function ProviderIcon({
  name,
  local,
  className,
}: {
  name: string
  type?: ProviderType
  local?: boolean
  className?: string
}) {
  if (local) {
    return (
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-green-700 text-white", className)}>
        <HardDriveIcon className="size-3.5" />
      </span>
    )
  }
  const color = COLORS.find(([re]) => re.test(name))?.[1] ?? "from-slate-400 to-slate-600"
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[11px] font-semibold text-white",
        color,
        className
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
