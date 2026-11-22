import type { Metadata } from "next"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { requirePageUser } from "@/server/http"

export const metadata: Metadata = { title: { default: "Verwaltung", template: "%s · Verwaltung" } }

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser(true)
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
          <span className="text-sm text-muted-foreground">
            Angemeldet als <span className="font-medium text-foreground">{user.display_name}</span>
          </span>
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
