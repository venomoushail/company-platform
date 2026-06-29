"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  getCurrentAdminContext,
  isAdminRole,
  type CurrentAdminContext,
} from "@/lib/auth/session";

type AdminAuthGuardProps = {
  children:
    | ReactNode
    | ((context: {
        adminContext: CurrentAdminContext | null;
        isMockAuth: boolean;
      }) => ReactNode);
};

type GuardState =
  | { status: "loading" }
  | { status: "mock" }
  | { status: "authorized"; adminContext: CurrentAdminContext }
  | { status: "unauthorized"; message: string };

export default function AdminAuthGuard({ children }: AdminAuthGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [guardState, setGuardState] = useState<GuardState>({
    status: "loading",
  });

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      const { context, error, isConfigured } = await getCurrentAdminContext();

      if (!isMounted) return;

      if (!isConfigured) {
        setGuardState({ status: "mock" });
        return;
      }

      if (!context) {
        const nextPath = pathname ? `?next=${encodeURIComponent(pathname)}` : "";

        router.replace(`/login${nextPath}`);
        return;
      }

      if (!isAdminRole(context.role)) {
        setGuardState({
          status: "unauthorized",
          message: "You do not have access to this admin area.",
        });
        return;
      }

      if (error) {
        setGuardState({
          status: "unauthorized",
          message: error.message,
        });
        return;
      }

      setGuardState({ status: "authorized", adminContext: context });
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [pathname, router]);

  if (guardState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <p className="text-sm font-medium text-slate-600">Checking session...</p>
      </main>
    );
  }

  if (guardState.status === "unauthorized") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Unauthorized</h1>
          <p className="mt-2 text-sm text-slate-600">{guardState.message}</p>
        </section>
      </main>
    );
  }

  const childContext =
    guardState.status === "authorized"
      ? { adminContext: guardState.adminContext, isMockAuth: false }
      : { adminContext: null, isMockAuth: true };

  return (
    <>
      {childContext.isMockAuth && (
        <div className="bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800">
          Supabase is not configured. Mock admin mode is active.
        </div>
      )}
      {typeof children === "function" ? children(childContext) : children}
    </>
  );
}
