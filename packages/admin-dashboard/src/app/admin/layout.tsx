"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  LayoutDashboard,
  FileQuestion,
  Sparkles,
  BarChart3,
  GraduationCap,
  Plus,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Questions",
    icon: FileQuestion,
    children: [
      { label: "Question Bank", href: "/admin/questions/bank" },
      { label: "Generate", href: "/admin/questions/generate" },
      { label: "Calibrate", href: "/admin/questions/calibrate" },
    ],
  },
  {
    label: "Exams",
    icon: GraduationCap,
    children: [
      { label: "Create Exam", href: "/admin/exams/create" },
    ],
  },
  {
    label: "Audit Log",
    href: "/admin/audit",
    icon: Shield,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Questions", "Exams"]));
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-card transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            {sidebarOpen && (
              <span className="font-bold text-lg bg-gradient-to-r from-pariksha-600 to-pariksha-400 bg-clip-text text-transparent">
                ParikshaSuraksha
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              if (item.href) {
                return (
                  <Link key={item.label} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {sidebarOpen && <span>{item.label}</span>}
                    </div>
                  </Link>
                );
              }

              const isExpanded = expandedGroups.has(item.label);

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {sidebarOpen && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </>
                    )}
                  </button>
                  {sidebarOpen && isExpanded && item.children && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Link key={child.href} href={child.href}>
                          <div
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
                              isActive(child.href)
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {child.label}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User section */}
        <div className="border-t p-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">
                  {user?.name?.charAt(0) || "A"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.role || "SUPER_ADMIN"}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" onClick={logout} className="w-full">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 overflow-auto transition-all duration-300",
          sidebarOpen ? "ml-64" : "ml-16"
        )}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
