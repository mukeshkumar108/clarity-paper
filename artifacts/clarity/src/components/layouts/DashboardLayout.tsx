import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, CreditCard, Settings, LogOut, Plus, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  immersive?: boolean;
}

export function DashboardLayout({ children, immersive = false }: DashboardLayoutProps) {
  const { logout, user } = useAuth();
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/billing", label: "Billing & Plans", icon: CreditCard },
    { href: "/settings", label: "Account Settings", icon: Settings },
  ];

  return (
    <div className="studio-app-shell h-screen overflow-hidden flex">
      {!immersive && (
      <aside className="studio-sidebar h-full overflow-hidden">
        <div className="flex h-[72px] items-center border-b border-pebble-gray/80 px-6 bg-canvas-parchment/70 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-inkwell shadow-subtle transition-transform group-hover:scale-[1.03] shrink-0">
              <div className="w-4 h-4 bg-canvas-parchment rounded-[2px] rotate-45" />
            </div>
            <div className="min-w-0">
              <span className="block text-[18px] font-semibold tracking-tight text-deep-shadow whitespace-nowrap">Clarity</span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-stone">Contract review</span>
            </div>
          </Link>
        </div>

        <div className="flex-1 px-4 py-5 space-y-8 overflow-y-auto">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone px-3">Actions</p>
            <Button asChild className="w-full justify-start bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92 px-4 h-11">
              <Link href="/documents/new">
                <Plus className="w-4 h-4" /> Review paper
              </Link>
            </Button>
          </div>

          <nav className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone px-3">Workspace</p>
            <div className="space-y-1.5">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "studio-sidebar-item cursor-pointer whitespace-nowrap border",
                    location === item.href 
                      ? "border-pebble-gray bg-white text-inkwell shadow-subtle" 
                      : "border-transparent text-muted-stone hover:border-pebble-gray/70 hover:bg-white/75 hover:text-inkwell"
                  )}>
                    <item.icon className={cn("w-4 h-4 shrink-0", location === item.href ? "text-onyx-outline" : "text-muted-stone/70")} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-pebble-gray/80 bg-canvas-parchment/70 shrink-0">
          <div className="mb-4 px-3 space-y-1">
            <p className="text-[14px] font-medium text-deep-shadow truncate leading-tight">{user?.name || "Member"}</p>
            <p className="text-[11px] text-muted-stone truncate">{user?.email}</p>
          </div>
          <Button 
            variant="secondary" 
            className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 h-10 px-4 border border-transparent shadow-none" 
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </Button>
        </div>
      </aside>
      )}

      <main className="studio-main-content bg-transparent overflow-x-hidden flex-1 min-w-0">
        <div className={cn(
          "w-full mx-auto",
          immersive
            ? "max-w-none px-0 py-0"
            : "max-w-[1240px] px-5 py-6 md:px-8 md:py-8 lg:px-10"
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
