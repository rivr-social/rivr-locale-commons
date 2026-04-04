"use client"

/**
 * Admin layout for the locale instance admin panel.
 *
 * Provides a sidebar with navigation to admin sub-pages including
 * badges, tasks, users, graph trace, and the operator org settings.
 * Adapted from global admin layout with locale-specific operator org section.
 */

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Shield,
  CheckSquare,
  Users,
  Home,
  ChevronRight,
  Network,
  Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"

/** Navigation items for the locale admin sidebar. */
const NAV_ITEMS = [
  {
    name: "Badge Management",
    href: "/admin/badges",
    icon: Shield,
  },
  {
    name: "Task Approval",
    href: "/admin/tasks",
    icon: CheckSquare,
  },
  {
    name: "User Management",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Graph Trace",
    href: "/admin/graph",
    icon: Network,
  },
  {
    name: "Operator Org",
    href: "/admin/operator",
    icon: Building2,
  },
] as const

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-sm transition-transform duration-300 transform",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Locale Admin</h1>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            <Link href="/" className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted">
              <Home className="h-5 w-5" />
              <span>Back to App</span>
            </Link>

            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-medium text-gray-500 uppercase">Management</p>
            </div>

            {NAV_ITEMS.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm rounded-md",
                  pathname === item.href
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-gray-700"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">A</span>
              </div>
              <div>
                <p className="text-sm font-medium">Locale Admin</p>
                <p className="text-xs text-gray-600">Instance administration</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle button */}
      <button
        className={cn(
          "fixed top-4 z-50 rounded-r-md bg-primary p-1.5 text-white transition-transform duration-300",
          isSidebarOpen ? "left-64" : "left-0"
        )}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <ChevronRight className={cn(
          "h-4 w-4 transition-transform duration-300",
          isSidebarOpen ? "rotate-180" : "rotate-0"
        )} />
      </button>

      {/* Main content */}
      <div className={cn(
        "flex-1 transition-all duration-300",
        isSidebarOpen ? "ml-64" : "ml-0"
      )}>
        <div className="min-h-screen bg-muted">
          {children}
        </div>
      </div>
    </div>
  )
}
