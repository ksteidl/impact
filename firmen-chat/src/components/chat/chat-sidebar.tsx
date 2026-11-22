"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useTheme } from "next-themes"
import {
  ChevronsUpDownIcon, KeyRoundIcon, LogOutIcon, MessageSquareIcon, MonitorIcon, MoonIcon, MoreHorizontalIcon,
  PencilIcon, SearchIcon, SettingsIcon, SquarePenIcon, SunIcon, Trash2Icon,
} from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Logo } from "@/components/app/logo"
import { fmtCompact, fmtNumber } from "@/lib/api"
import type { ConversationSummary, Me } from "@/lib/types"

function groupByDate(items: ConversationSummary[]) {
  const startToday = new Date().setHours(0, 0, 0, 0)
  const day = 86400000
  const groups: [string, ConversationSummary[]][] = [
    ["Heute", []],
    ["Gestern", []],
    ["Letzte 7 Tage", []],
    ["Letzte 30 Tage", []],
    ["Älter", []],
  ]
  for (const c of items) {
    const t = c.updated_at
    const idx = t >= startToday ? 0 : t >= startToday - day ? 1 : t >= startToday - 7 * day ? 2 : t >= startToday - 30 * day ? 3 : 4
    groups[idx][1].push(c)
  }
  return groups.filter(([, list]) => list.length)
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

type Props = {
  me: Me
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (c: ConversationSummary) => void
  onDelete: (c: ConversationSummary) => void
  onChangePassword: () => void
  onLogout: () => void
}

export function ChatSidebar(p: Props) {
  const [query, setQuery] = useState("")
  const { theme, setTheme } = useTheme()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? p.conversations.filter((c) => c.title.toLowerCase().includes(q)) : p.conversations
  }, [p.conversations, query])
  const groups = useMemo(() => groupByDate(filtered), [filtered])
  const pct = p.me.dailyLimit ? Math.min(100, Math.round((p.me.usageToday / p.me.dailyLimit) * 100)) : 0

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 px-3 pt-3">
        <div className="flex items-center justify-between">
          <Logo />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={p.onNew} aria-label="Neuer Chat">
                <SquarePenIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Neuer Chat</TooltipContent>
          </Tooltip>
        </div>
        <Button onClick={p.onNew} className="w-full justify-start gap-2 shadow-sm">
          <SquarePenIcon /> Neuer Chat
        </Button>
        {p.me.storeChats && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chats durchsuchen"
              className="h-8 bg-background pl-8 text-sm"
              aria-label="Chats durchsuchen"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {!p.me.storeChats ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Die Speicherung von Chats ist durch die Verwaltung deaktiviert. Verläufe bleiben nur in diesem Tab.
          </p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <MessageSquareIcon className="size-5 opacity-60" />
            {query ? "Keine Treffer." : "Noch keine Chats – legen Sie los!"}
          </div>
        ) : (
          groups.map(([label, items]) => (
            <SidebarGroup key={label} className="py-1">
              <SidebarGroupLabel>{label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton isActive={c.id === p.activeId} onClick={() => p.onSelect(c.id)} title={c.title}>
                      <span className="truncate">{c.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover aria-label="Aktionen">
                          <MoreHorizontalIcon />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="w-44">
                        <DropdownMenuItem onSelect={() => p.onRename(c)}>
                          <PencilIcon /> Umbenennen
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => p.onDelete(c)}>
                          <Trash2Icon /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="gap-3 p-3">
        <div className="rounded-lg border bg-background/60 p-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Heute genutzt</span>
            <span className="text-muted-foreground tabular-nums">
              {fmtCompact(p.me.usageToday)}
              {p.me.dailyLimit ? ` / ${fmtCompact(p.me.dailyLimit)}` : ""} Tokens
            </span>
          </div>
          {p.me.dailyLimit > 0 && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${fmtNumber(p.me.usageToday)} von ${fmtNumber(p.me.dailyLimit)} Tokens`}
            >
              <div
                className={`h-full rounded-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {initials(p.me.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{p.me.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{p.me.department || p.me.username}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{p.me.displayName}</div>
              <div className="text-xs text-muted-foreground">@{p.me.username}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {p.me.role === "admin" && (
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <SettingsIcon /> Verwaltung
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={p.onChangePassword}>
              <KeyRoundIcon /> Passwort ändern
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunIcon /> Darstellung
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <SunIcon /> Hell
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <MoonIcon /> Dunkel
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <MonitorIcon /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={p.onLogout}>
              <LogOutIcon /> Abmelden
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
