"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Company } from "@/types/supabase";

type CompanyThemeSource =
  | Pick<
      Company,
      | "name"
      | "primary_color"
      | "secondary_color"
      | "accent_color"
      | "logo_url"
      | "favicon_url"
    >
  | null
  | undefined;

type CompanyTheme = {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

export type CompanyThemeUpdate = NonNullable<CompanyThemeSource>;

type CompanyThemeContextValue = CompanyTheme & {
  updateCompanyTheme: (company: CompanyThemeUpdate) => void;
};

const defaultTheme: CompanyThemeContextValue = {
  companyName: "Training Admin",
  primaryColor: "#1E3A8A",
  secondaryColor: "#FFFFFF",
  accentColor: "#2563EB",
  primaryTextColor: "#FFFFFF",
  logoUrl: null,
  faviconUrl: null,
  updateCompanyTheme: () => {},
};

const CompanyThemeContext = createContext<CompanyThemeContextValue>(defaultTheme);
let lastCompanyThemeSource: CompanyThemeUpdate | null = null;

function normalizeColor(value: string | null | undefined, fallback: string) {
  const color = value?.trim();

  if (!color) return fallback;

  return color;
}

function getReadableTextColor(backgroundColor: string) {
  const hex = backgroundColor.trim().replace(/^#/, "");
  const normalizedHex =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
    return defaultTheme.secondaryColor;
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.6 ? "#111827" : "#FFFFFF";
}

function buildCompanyTheme(company: CompanyThemeSource): CompanyTheme {
  const primaryColor = normalizeColor(
    company?.primary_color,
    defaultTheme.primaryColor
  );
  const secondaryColor = normalizeColor(
    company?.secondary_color,
    defaultTheme.secondaryColor
  );
  const accentColor = normalizeColor(
    company?.accent_color,
    defaultTheme.accentColor
  );

  return {
    companyName: company?.name?.trim() || defaultTheme.companyName,
    primaryColor,
    secondaryColor,
    accentColor,
    primaryTextColor: getReadableTextColor(primaryColor),
    logoUrl: company?.logo_url?.trim() || null,
    faviconUrl: company?.favicon_url?.trim() || null,
  };
}

function updateFavicon(faviconUrl: string | null) {
  let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");

  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }

  favicon.href = faviconUrl || "/favicon.ico";
}

export function CompanyThemeProvider({
  company,
  children,
}: {
  company: CompanyThemeSource;
  children: ReactNode;
}) {
  const [themeOverride, setThemeOverride] = useState<CompanyThemeSource>(null);
  const activeCompany = themeOverride ?? company;
  const resolvedCompany = activeCompany ?? lastCompanyThemeSource;

  const theme = useMemo(() => buildCompanyTheme(resolvedCompany), [resolvedCompany]);
  const updateCompanyTheme = useCallback((nextCompany: CompanyThemeUpdate) => {
    setThemeOverride(nextCompany);
  }, []);
  const contextValue = useMemo(
    () => ({
      ...theme,
      updateCompanyTheme,
    }),
    [theme, updateCompanyTheme]
  );
  const themeStyles = resolvedCompany
    ? ({
        "--company-primary": theme.primaryColor,
        "--company-secondary": theme.secondaryColor,
        "--company-accent": theme.accentColor,
        "--company-primary-text": theme.primaryTextColor,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (!resolvedCompany) return;

    if (activeCompany) {
      lastCompanyThemeSource = activeCompany;
    }

    document.documentElement.style.setProperty(
      "--company-primary",
      theme.primaryColor
    );
    document.documentElement.style.setProperty(
      "--company-secondary",
      theme.secondaryColor
    );
    document.documentElement.style.setProperty(
      "--company-accent",
      theme.accentColor
    );
    document.documentElement.style.setProperty(
      "--company-primary-text",
      theme.primaryTextColor
    );

    updateFavicon(theme.faviconUrl);
    document.title = `${theme.companyName} Training`;
  }, [activeCompany, resolvedCompany, theme]);

  return (
    <CompanyThemeContext.Provider value={contextValue}>
      <div style={themeStyles}>{children}</div>
    </CompanyThemeContext.Provider>
  );
}

export function useCompanyTheme() {
  return useContext(CompanyThemeContext);
}
