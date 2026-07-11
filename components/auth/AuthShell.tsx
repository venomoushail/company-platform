"use client";

import { useEffect, useState } from "react";
import { CompanyThemeProvider, useCompanyTheme } from "@/components/theme/CompanyThemeProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Company } from "@/types/supabase";

type AuthCompany = Pick<
  Company,
  | "name"
  | "website"
  | "primary_color"
  | "secondary_color"
  | "accent_color"
  | "logo_url"
  | "favicon_url"
>;

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function getWebsiteHost(website: string | null) {
  if (!website?.trim()) return null;

  try {
    const url = new URL(
      website.includes("://") ? website : `https://${website}`
    );

    return normalizeHost(url.hostname);
  } catch {
    return null;
  }
}

function getDomainMatch(companies: AuthCompany[], currentHost: string) {
  const normalizedCurrentHost = normalizeHost(currentHost);

  return (
    companies.find((company) => {
      const websiteHost = getWebsiteHost(company.website);

      if (!websiteHost) return false;

      return (
        normalizedCurrentHost === websiteHost ||
        normalizedCurrentHost.endsWith(`.${websiteHost}`)
      );
    }) ?? null
  );
}

function AuthCard({ title, description, children }: AuthShellProps) {
  const { companyName, logoUrl } = useCompanyTheme();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={companyName}
              className="mb-4 max-h-12 max-w-48 object-contain"
            />
          ) : (
            <p className="text-sm font-semibold company-accent-link">
              {companyName}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        {children}
      </section>
    </main>
  );
}

export default function AuthShell({
  title,
  description,
  children,
}: AuthShellProps) {
  const [company, setCompany] = useState<AuthCompany | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createBrowserSupabaseClient();

    if (!supabase) return;

    const client = supabase;

    async function loadCompanyBranding() {
      const { data, error } = await client
        .from("companies")
        .select(
          "name,website,primary_color,secondary_color,accent_color,logo_url,favicon_url"
        )
        .eq("is_active", true);

      if (!isMounted || error || !data) return;

      setCompany(getDomainMatch(data, window.location.hostname));
    }

    loadCompanyBranding();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <CompanyThemeProvider company={company}>
      <AuthCard title={title} description={description}>
        {children}
      </AuthCard>
    </CompanyThemeProvider>
  );
}
