"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  LogOut,
  UserCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { CompanyThemeProvider, useCompanyTheme } from "@/components/theme/CompanyThemeProvider";
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
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className="shrink-0 text-[var(--company-accent)] lg:sticky lg:top-0 lg:h-screen lg:w-72"
          style={{ background: "var(--company-primary)" }}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-white/15 p-6">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="max-h-14 max-w-44 object-contain"
                />
              ) : (
                <h1 className="text-xl font-bold">{companyName}</h1>
              )}
              <p className="mt-2 text-sm opacity-75">Employee Training</p>
            </div>

            <nav className="flex gap-2 overflow-x-auto p-4 lg:block lg:space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setActiveTab(item.key)}
                    className={`relative flex min-w-max items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition hover:bg-black/15 lg:min-w-0 ${
                      isActive ? "bg-black/15" : ""
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-3 right-3 h-1 rounded-full lg:bottom-2 lg:left-0 lg:right-auto lg:top-2 lg:h-auto lg:w-1"
                        style={{ background: "var(--company-secondary)" }}
                      />
                    )}
                    <Icon size={19} strokeWidth={2.3} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-white/15 p-4">
              <div className="rounded-lg bg-black/10 p-3">
                <p className="text-sm font-semibold">
                  {profile?.preferred_name || profile?.first_name || "Employee"}
                </p>
                <p className="mt-0.5 text-xs opacity-75">Training account</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-black/15"
                >
                  <LogOut size={15} />
                  Sign Out
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
