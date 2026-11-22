"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Löschen",
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (ex) {
                toast.error((ex as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Spinner />} {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  label: string
  initial: string
  onSubmit: (value: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <PromptBody title={title} label={label} initial={initial} onSubmit={onSubmit} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PromptBody({ title, label, initial, onSubmit, close }: { title: string; label: string; initial: string; onSubmit: (v: string) => Promise<void>; close: () => void }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!value.trim()) return
        setBusy(true)
        try {
          await onSubmit(value.trim())
          close()
        } catch (ex) {
          toast.error((ex as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="prompt-value">{label}</Label>
        <Input id="prompt-value" value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={120} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy && <Spinner />} Speichern
        </Button>
      </DialogFooter>
    </form>
  )
}

export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <PasswordBody close={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function PasswordBody({ close }: { close: () => void }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setError("")
        if (next !== repeat) return setError("Die neuen Passwörter stimmen nicht überein.")
        setBusy(true)
        try {
          await api("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } })
          toast.success("Passwort geändert.")
          close()
        } catch (ex) {
          setError((ex as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Passwort ändern</DialogTitle>
        <DialogDescription>Mindestens 10 Zeichen und 3 von: Klein-, Großbuchstaben, Ziffern, Sonderzeichen.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="pw-c">Aktuelles Passwort</Label>
        <Input id="pw-c" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw-n">Neues Passwort</Label>
        <Input id="pw-n" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw-r">Neues Passwort wiederholen</Label>
        <Input id="pw-r" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={10} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner />} Passwort speichern
        </Button>
      </DialogFooter>
    </form>
  )
}
