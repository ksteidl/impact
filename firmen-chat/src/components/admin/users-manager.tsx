"use client"

import { useState } from "react"
import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, ShieldIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { api, fmtCompact, fmtDate } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/app/dialogs"
import { initials } from "@/components/chat/chat-sidebar"
import { PageHeader } from "./admin-sidebar"
import { FormField, useAction } from "./form"
import type { AdminUser } from "@/server/admin"

type Draft = { username: string; displayName: string; department: string; role: "user" | "admin"; dailyTokenLimit: string; password: string; active: boolean }

function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: AdminUser }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{open && <UserForm user={user} close={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function UserForm({ user, close }: { user?: AdminUser; close: () => void }) {
  const [d, setD] = useState<Draft>({
    username: user?.username ?? "",
    displayName: user?.displayName ?? "",
    department: user?.department ?? "",
    role: user?.role ?? "user",
    dailyTokenLimit: user?.dailyTokenLimit == null ? "" : String(user.dailyTokenLimit),
    password: "",
    active: user?.active ?? true,
  })
  const { run, pending } = useAction()
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value })
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        await run(
          () => (user ? api(`/api/admin/users/${user.id}`, { method: "PUT", body: d }) : api("/api/admin/users", { method: "POST", body: d })),
          user ? "Benutzer gespeichert." : "Benutzer angelegt."
        ).then(close, () => {})
      }}
    >
      <DialogHeader>
        <DialogTitle>{user ? `${user.displayName} bearbeiten` : "Benutzer anlegen"}</DialogTitle>
        <DialogDescription>
          {user ? `@${user.username}` : "Der Benutzer muss das Startpasswort bei der ersten Anmeldung ändern."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {!user && (
          <FormField label="Benutzername" htmlFor="u-name">
            <Input id="u-name" value={d.username} onChange={set("username")} required placeholder="anna.berger" autoComplete="off" />
          </FormField>
        )}
        <FormField label="Anzeigename" htmlFor="u-display" className={user ? "sm:col-span-2" : ""}>
          <Input id="u-display" value={d.displayName} onChange={set("displayName")} placeholder="Anna Berger" />
        </FormField>
        <FormField label="Abteilung" htmlFor="u-dep" hint="Steuert die Modellfreigaben.">
          <Input id="u-dep" value={d.department} onChange={set("department")} placeholder="Vertrieb" />
        </FormField>
        <FormField label="Rolle">
          <Select value={d.role} onValueChange={(v) => setD({ ...d, role: v as Draft["role"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Mitarbeiter</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Token-Limit pro Tag" htmlFor="u-limit" hint="Leer = Standard, 0 = unbegrenzt">
          <Input id="u-limit" type="number" min={0} value={d.dailyTokenLimit} onChange={set("dailyTokenLimit")} placeholder="Standard" />
        </FormField>
        <FormField label={user ? "Neues Passwort" : "Startpasswort"} htmlFor="u-pw" hint={user ? "Leer = unverändert" : "Mind. 10 Zeichen"}>
          <Input id="u-pw" type="password" autoComplete="new-password" value={d.password} onChange={set("password")} required={!user} />
        </FormField>
      </div>
      {user && (
        <label className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Konto aktiv</p>
            <p className="text-xs text-muted-foreground">Gesperrte Konten werden sofort abgemeldet.</p>
          </div>
          <Switch checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
        </label>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />} Speichern
        </Button>
      </DialogFooter>
    </form>
  )
}

export function UsersManager({ users, meId, defaultLimit }: { users: AdminUser[]; meId: number; defaultLimit: number }) {
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<AdminUser | undefined>()
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [query, setQuery] = useState("")
  const { run } = useAction()
  const q = query.toLowerCase()
  const list = users.filter((u) => `${u.displayName} ${u.username} ${u.department}`.toLowerCase().includes(q))

  return (
    <>
      <PageHeader title="Benutzer" description={`${users.filter((u) => u.active).length} aktive Konten · Standard-Tageslimit ${defaultLimit ? `${fmtCompact(defaultLimit)} Tokens` : "unbegrenzt"}`}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen …" className="w-56" />
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialog(true)
          }}
        >
          <UserPlusIcon /> Benutzer anlegen
        </Button>
      </PageHeader>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Abteilung</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Tageslimit</TableHead>
              <TableHead>Letzte Anmeldung</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(u.displayName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-xs text-muted-foreground">@{u.username}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{u.department ? <Badge variant="secondary">{u.department}</Badge> : <span className="text-muted-foreground">–</span>}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="gap-1">
                      <ShieldIcon className="size-3" /> Admin
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Mitarbeiter</span>
                  )}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {u.dailyTokenLimit === null ? <span className="text-muted-foreground">Standard</span> : u.dailyTokenLimit === 0 ? "unbegrenzt" : fmtCompact(u.dailyTokenLimit)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(u.lastLogin)}</TableCell>
                <TableCell>
                  {!u.active ? (
                    <Badge variant="outline" className="text-muted-foreground">Gesperrt</Badge>
                  ) : u.mustChangePassword ? (
                    <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
                      <KeyRoundIcon className="size-3" /> Erstanmeldung
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-success/30 text-success">Aktiv</Badge>
                  )}
                </TableCell>
                <TableCell className="pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label="Aktionen">
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(u)
                          setDialog(true)
                        }}
                      >
                        <PencilIcon /> Bearbeiten
                      </DropdownMenuItem>
                      {u.id !== meId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(u)}>
                            <Trash2Icon /> Löschen
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <UserDialog open={dialog} onOpenChange={setDialog} user={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Benutzer löschen?"
        description={`„${deleting?.displayName}“ und alle gespeicherten Chats werden endgültig gelöscht. Einträge im Nutzungsprotokoll bleiben bis zum Ablauf der Aufbewahrungsfrist erhalten.`}
        onConfirm={() => run(() => api(`/api/admin/users/${deleting!.id}`, { method: "DELETE" }), "Benutzer gelöscht.").then(() => {})}
      />
    </>
  )
}
