"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArrowLeftIcon, BoxesIcon, LayoutDashboardIcon, LogOutIcon, ScrollTextIcon, ServerIcon, ShieldIcon, UsersIcon,
} from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar"
import { Logo } from "@/components/app/logo"
import { api } from "@/lib/api"

const NAV = [
  { href: "/admin", label: "Übersicht", icon: LayoutDashboardIcon },
  { href: "/admin/models", label: "Modelle", icon: BoxesIcon },
  { href: "/admin/providers", label: "Anbieter", icon: ServerIcon },
  { href: "/admin/users", label: "Benutzer", icon: UsersIcon },
  { href: "/admin/policies", label: "Richtlinien", icon: ShieldIcon },
  { href: "/admin/audit", label: "Protokoll", icon: ScrollTextIcon },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="p-3">
        <Logo subtitle="Verwaltung" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Verwaltung</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => {
                const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)
                return (
                  <SidebarMenuItem key={n.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={n.label}>
                      <Link href={n.href}>
                        <n.icon />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <ArrowLeftIcon />
                <span>Zurück zum Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {})
                router.replace("/login")
                router.refresh()
              }}
            >
              <LogOutIcon />
              <span>Abmelden</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
