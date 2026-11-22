"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground text-pretty">{hint}</p>}
    </div>
  )
}

/** Führt eine Aktion aus, zeigt Erfolg/Fehler als Toast und lädt die Server-Daten neu. */
export function useAction() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setPending(true)
    try {
      const r = await fn()
      if (success) toast.success(success)
      router.refresh()
      return r
    } catch (e) {
      toast.error((e as Error).message)
      throw e
    } finally {
      setPending(false)
    }
  }
  return { run, pending }
}
