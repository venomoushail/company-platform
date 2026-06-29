"use client";

import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCompanyTheme } from "@/components/theme/CompanyThemeProvider";

type AppSidebarProps = {
  isCollapsed: boolean;
  onToggle: () => void;
  userName: string;
  userRole: string;
  isMockAuth: boolean;
  onSignOut: () => void;
};

const navigation = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
  },
  {
    label: "Training",
    href: "/training",
    icon: GraduationCap,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default function AppSidebar({
  isCollapsed,
  onToggle,
  userName,
  userRole,
  isMockAuth,
  onSignOut,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { companyName, logoUrl } = useCompanyTheme();

  return (
    <aside
      className={`relative sticky top-0 h-screen shrink-0 text-[var(--company-accent)] transition-all duration-300 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
      style={{ background: "var(--company-primary)" }}
    >
      {/* Header */}
      <div className="border-b border-white/15 p-6">
        <div className="flex items-start justify-between">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={companyName}
                className={`max-h-12 object-contain ${
                  isCollapsed ? "max-w-10" : "max-w-36"
                }`}
              />
            ) : (
              <h1 className="text-xl font-bold">
                {isCollapsed ? companyName.slice(0, 2) : companyName}
              </h1>
            )}

            {!isCollapsed && (
              <p className="mt-1 text-sm opacity-75">
                Employee Training System
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/10 transition hover:bg-black/20"
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronLeft size={20} />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 p-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <a
              key={item.label}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-xl px-4 py-3 transition hover:bg-black/15 ${
                isActive ? "bg-black/15" : ""
              }`}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-full"
                  style={{ background: "var(--company-secondary)" }}
                />
              )}
              <Icon size={22} strokeWidth={2} />

              {!isCollapsed && (
                <span className="font-medium">
                  {item.label}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* User */}
      <div className="absolute bottom-6 left-0 w-full px-4">
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/10 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-lg font-bold">
            N
          </div>

          {!isCollapsed && (
            <div>
              <p className="font-medium">{userName}</p>
              <p className="text-xs capitalize opacity-75">
                {isMockAuth ? "Mock admin" : userRole}
              </p>
            </div>
          )}

          {!isMockAuth && (
            <button
              type="button"
              onClick={onSignOut}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg opacity-80 hover:bg-black/15 hover:opacity-100"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
