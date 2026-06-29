"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAuthGuard from "@/components/auth/AdminAuthGuard";
import { signOutCurrentUser } from "@/lib/auth/session";
import { CompanyThemeProvider } from "@/components/theme/CompanyThemeProvider";
import AppSidebar from "./AppSidebar";

interface AdminLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function AdminLayout({
  title,
  description,
  children,
}: AdminLayoutProps) {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  async function handleSignOut() {
    await signOutCurrentUser();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AdminAuthGuard>
      {({ adminContext, isMockAuth }) => (
        <CompanyThemeProvider company={adminContext?.company}>
        <main className="min-h-screen bg-slate-100">
          <div className="flex min-h-screen">
            <AppSidebar
              isCollapsed={isSidebarCollapsed}
              onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              userName={
                adminContext?.profile.preferred_name ||
                adminContext?.profile.first_name ||
                "Mock Admin"
              }
              userRole={adminContext?.profile.role || "admin"}
              isMockAuth={isMockAuth}
              onSignOut={handleSignOut}
            />

            <section className="min-w-0 flex-1">
              <header className="border-b border-slate-200 bg-white px-8 py-5">
                <h1 className="text-2xl font-bold text-slate-900">{title}</h1>

                {description && (
                  <p className="mt-1 text-sm text-slate-500">{description}</p>
                )}
              </header>

              <div className="p-8">{children}</div>
            </section>
          </div>
        </main>
        </CompanyThemeProvider>
      )}
    </AdminAuthGuard>
  );
}
