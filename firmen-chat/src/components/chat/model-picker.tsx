"use client"

import { useMemo, useState } from "react"
import { CheckIcon, ChevronDownIcon, LockIcon, GlobeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { ProviderIcon } from "./provider-icon"
import type { ChatModel } from "@/lib/types"

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ChatModel[]
  value: number | null
  onChange: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const current = models.find((m) => m.id === value)
  const groups = useMemo(() => {
    const map = new Map<string, ChatModel[]>()
    for (const m of models) {
      const key = m.local ? "Lokal – Daten bleiben im Firmennetz" : m.provider
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return [...map.entries()].sort(([a], [b]) => (a.startsWith("Lokal") ? -1 : b.startsWith("Lokal") ? 1 : a.localeCompare(b)))
  }, [models])

  if (!models.length) {
    return <span className="text-sm text-muted-foreground">Keine Modelle freigegeben</span>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2.5 text-[15px] font-semibold" aria-label="Modell wählen">
          {current && <ProviderIcon name={current.provider} local={current.local} className="size-5 rounded-[5px]" />}
          <span className="max-w-[45vw] truncate">{current?.name ?? "Modell wählen"}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <Command>
          <CommandInput placeholder="Modell suchen …" />
          <CommandList className="max-h-[22rem]">
            <CommandEmpty>Kein Modell gefunden.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.name} ${m.provider} ${m.id}`}
                    onSelect={() => {
                      onChange(m.id)
                      setOpen(false)
                    }}
                    className="items-start gap-3 py-2"
                  >
                    <ProviderIcon name={m.provider} local={m.local} className="mt-0.5" />
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-center gap-2 font-medium">
                        {m.name}
                        {m.local ? (
                          <Badge variant="outline" className="h-4 gap-1 border-success/30 px-1.5 text-[10px] text-success">
                            <LockIcon className="size-2.5" /> Lokal
                          </Badge>
                        ) : null}
                      </span>
                      {m.description && <span className="text-xs text-muted-foreground line-clamp-2">{m.description}</span>}
                    </div>
                    <CheckIcon className={m.id === value ? "mt-1 size-4 text-primary" : "mt-1 size-4 opacity-0"} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function PrivacyBadge({ model }: { model?: ChatModel }) {
  if (!model) return null
  return model.local ? (
    <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
      <LockIcon className="size-3" /> Lokal
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning">
      <GlobeIcon className="size-3" /> Extern · {model.provider}
    </Badge>
  )
}
