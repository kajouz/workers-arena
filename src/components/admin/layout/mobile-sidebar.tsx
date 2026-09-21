"use client";

import { useState } from "react";
import { Link } from "@/components/i18n/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CreditCard,
  DollarSign,
  Calculator,
  TrendingUp,
  BarChart3,
  Shield,
  MessageSquare,
  AlertTriangle,
  Settings,
  FileText,
  Headphones,
  Scale,
  Zap,
  Megaphone,
  Wallet,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "../search/global-search";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: <LayoutDashboard className="w-4 h-4" /> },
    ],
  },
  {
    title: "Users & Bookings",
    items: [
      { label: "Workers", href: "/admin/workers", icon: <Users className="w-4 h-4" /> },
      { label: "Bookings", href: "/admin/bookings", icon: <Briefcase className="w-4 h-4" /> },
      { label: "Customers", href: "/admin/customers", icon: <Users className="w-4 h-4" /> },
      { label: "Categories", href: "/admin/categories", icon: <Building2 className="w-4 h-4" /> },
    ],
  },
  {
    title: "Finance & Revenue",
    items: [
      { label: "Finances", href: "/admin/revenue", icon: <CreditCard className="w-4 h-4" /> },
      { label: "Financial Analysis", href: "/admin/financial", icon: <Calculator className="w-4 h-4" /> },
      { label: "Revenue Streams", href: "/admin/revenue-settings", icon: <TrendingUp className="w-4 h-4" /> },
      { label: "Invoices", href: "/admin/invoices", icon: <FileText className="w-4 h-4" /> },
      { label: "Earnings", href: "/admin/earnings", icon: <Wallet className="w-4 h-4" /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: <BarChart3 className="w-4 h-4" /> },
      { label: "Communications", href: "/admin/communications", icon: <MessageSquare className="w-4 h-4" /> },
      { label: "Emergency", href: "/admin/emergency", icon: <AlertTriangle className="w-4 h-4" /> },
      { label: "Advertise", href: "/company", icon: <Megaphone className="w-4 h-4" /> },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Security", href: "/admin/security", icon: <Shield className="w-4 h-4" /> },
      { label: "Automation", href: "/admin/automation", icon: <Zap className="w-4 h-4" /> },
      { label: "Support", href: "/admin/support", icon: <Headphones className="w-4 h-4" /> },
      { label: "Disputes", href: "/admin/disputes", icon: <Scale className="w-4 h-4" /> },
      { label: "Logs", href: "/admin/logs", icon: <FileText className="w-4 h-4" /> },
      { label: "Settings", href: "/admin/settings", icon: <Settings className="w-4 h-4" /> },
    ],
  },
];

interface MobileSidebarProps {
  className?: string;
}

/**
 * Mobile Admin Layout with responsive sidebar
 */
export function MobileSidebar({ className }: MobileSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-dialog p-2.5 bg-white dark:bg-ink-900 rounded-xl shadow-lg border border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-950 transition-colors"
      >
        <Menu className="w-5 h-5 text-ink-700 dark:text-ink-200" />
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-dialog bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-dialog h-full w-72 bg-white dark:bg-ink-900 border-r border-ink-200 dark:border-ink-800 transform transition-transform duration-300 ease-in-out overflow-y-auto",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto",
          className
        )}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b bg-white/80 backdrop-blur-sm dark:bg-ink-900/80">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">WA</span>
            </div>
            <div>
              <span className="font-bold text-ink-900 dark:text-ink-50 text-sm">Admin Panel</span>
              <p className="text-[10px] text-ink-400 dark:text-ink-500">Workers Arena</p>
            </div>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-ink-500 dark:text-ink-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <GlobalSearch />
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-5">
          {navigation.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-ink-400 dark:text-ink-500">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm",
                        isActive
                          ? "bg-brand-50 text-brand-700 font-semibold shadow-sm"
                          : "text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-950 hover:text-ink-900 dark:hover:text-ink-50"
                      )}
                    >
                      <span className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-lg transition-colors",
                        isActive
                          ? "bg-brand-100 text-brand-600"
                          : "bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400"
                      )}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white/80 backdrop-blur-sm dark:bg-ink-900/80 px-3 py-4">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-50 dark:bg-ink-950">
            <div className="w-9 h-9 bg-gradient-to-br from-ink-200 dark:from-ink-800 to-ink-300 dark:to-ink-700 rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-ink-600 dark:text-ink-300">A</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">Admin User</p>
              <p className="text-xs text-ink-400 dark:text-ink-500 truncate">admin@workersarena.com</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
