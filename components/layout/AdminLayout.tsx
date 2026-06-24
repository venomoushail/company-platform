import { ReactNode } from "react";
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
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <AppSidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <h1 className="text-2xl font-bold text-slate-900">
              {title}
            </h1>

            {description && (
              <p className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            )}
          </header>

          <div className="p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}