"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  UserCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { CompanyThemeProvider, useCompanyTheme } from "@/components/theme/CompanyThemeProvider";
import { isAdminRole } from "@/lib/auth/roles";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Company, Profile } from "@/types/supabase";

type EmployeeLayoutCompany = Pick<
  Company,
  | "id"
  | "name"
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "logo_url"
  | "favicon_url"
>;

type EmployeeLayoutProps = {
  company: EmployeeLayoutCompany | null;
  profile: Profile | null;
  title: string;
  description?: string;
  children: ReactNode;
};

const employeeThemeStorageKey = "employeeCompanyTheme";
const employeeThemeStorageEvent = "employee-company-theme-updated";
let cachedEmployeeThemeRaw: string | null = null;
let cachedEmployeeThemeValue: EmployeeLayoutCompany | null = null;

const navigation = [
  {
    key: "my-trainings",
    label: "My Trainings",
    href: "/employee/dashboard",
    icon: BookOpenCheck,
  },
  {
    key: "completed",
    label: "Completed",
    href: "/employee/dashboard?status=completed",
    icon: CheckCircle2,
  },
  {
    key: "account",
    label: "Account",
    href: "/employee/dashboard?panel=account",
    icon: UserCircle,
  },
];

function readCachedEmployeeCompany() {
  if (typeof window === "undefined") return null;

  try {
    const storedCompany = window.localStorage.getItem(employeeThemeStorageKey);

    if (storedCompany === cachedEmployeeThemeRaw) {
      return cachedEmployeeThemeValue;
    }

    cachedEmployeeThemeRaw = storedCompany;
    cachedEmployeeThemeValue = storedCompany
      ? (JSON.parse(storedCompany) as EmployeeLayoutCompany)
      : null;

    return cachedEmployeeThemeValue;
  } catch {
    return null;
  }
}

function subscribeToCachedEmployeeCompany(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(employeeThemeStorageEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(employeeThemeStorageEvent, onStoreChange);
  };
}

function useCachedEmployeeCompany() {
  return useSyncExternalStore(
    subscribeToCachedEmployeeCompany,
    readCachedEmployeeCompany,
    () => null
  );
}

function EmployeeShell({
  profile,
  title,
  description,
  children,
}: Omit<EmployeeLayoutProps, "company">) {
  const pathname = usePathname();
  const router = useRouter();
  const { companyName, logoUrl } = useCompanyTheme();
  const [activeTab, setActiveTab] = useState("my-trainings");
  const canAccessAdminPortal = profile ? isAdminRole(profile.role) : false;

  useEffect(() => {
    function syncActiveTab() {
      const params = new URLSearchParams(window.location.search);

      if (params.get("panel") === "account") {
        setActiveTab("account");
      } else if (params.get("status") === "completed") {
        setActiveTab("completed");
      } else {
        setActiveTab("my-trainings");
      }
    }

    syncActiveTab();
    window.addEventListener("popstate", syncActiveTab);

    return () => window.removeEventListener("popstate", syncActiveTab);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside
          className="relative sticky top-0 h-screen w-20 shrink-0 text-[var(--company-accent)] transition-all duration-300 sm:w-64"
          style={{ background: "var(--company-primary)" }}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-white/15 p-6">
              <div className="min-w-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt={companyName}
                    className="max-h-12 max-w-10 object-contain sm:max-w-36"
                  />
                ) : (
                  <h1 className="truncate text-xl font-bold">
                    <span className="sm:hidden">{companyName.slice(0, 2)}</span>
                    <span className="hidden sm:inline">{companyName}</span>
                  </h1>
                )}
                <p className="mt-1 hidden text-sm opacity-75 sm:block">
                  Employee Training
                </p>
              </div>
            </div>

            <nav className="space-y-2 p-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setActiveTab(item.key)}
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
                    <span className="hidden font-medium sm:inline">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="absolute bottom-6 left-0 w-full px-4">
              <div className="rounded-xl border border-white/15 bg-black/10 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-lg font-bold">
                  {(profile?.preferred_name || profile?.first_name || "E")
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div className="mt-3 hidden sm:block">
                  <p className="truncate text-sm font-semibold">
                    {profile?.preferred_name || profile?.first_name || "Employee"}
                  </p>
                  <p className="mt-0.5 text-xs opacity-75">Training account</p>
                </div>
                {canAccessAdminPortal && (
                  <Link
                    href="/"
                    className="mt-3 flex h-9 items-center justify-center gap-2 rounded-lg border border-white/20 px-2 text-xs font-semibold hover:bg-black/15 sm:justify-start sm:px-3"
                    aria-label="Admin Portal"
                  >
                    <LayoutDashboard size={15} />
                    <span className="hidden sm:inline">Admin Portal</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-2 text-xs font-semibold hover:bg-black/15 sm:justify-start sm:px-3"
                  aria-label="Sign Out"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white px-6 py-5 md:px-8">
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </header>

          <div className="px-6 py-8 md:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}

export default function EmployeeLayout({
  company,
  profile,
  title,
  description,
  children,
}: EmployeeLayoutProps) {
  const cachedCompany = useCachedEmployeeCompany();
  // AdminAuthGuard waits for company data before rendering AppSidebar.
  // Employee pages render while their page-level training fetch is loading, so
  // keep the last employee company here instead of briefly reapplying defaults.
  const effectiveCompany = company ?? cachedCompany;

  useEffect(() => {
    if (!company) return;

    try {
      window.localStorage.setItem(employeeThemeStorageKey, JSON.stringify(company));
      window.dispatchEvent(new Event(employeeThemeStorageEvent));
    } catch {
      // Ignore storage failures; the live company prop still carries the theme.
    }
  }, [company]);

  return (
    <CompanyThemeProvider company={effectiveCompany}>
      <EmployeeShell profile={profile} title={title} description={description}>
        {children}
      </EmployeeShell>
    </CompanyThemeProvider>
  );
}
