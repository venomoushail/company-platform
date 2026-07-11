"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import PasswordResetRequestForm from "@/components/auth/PasswordResetRequestForm";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isAdminRole } from "@/lib/auth/roles";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    if (!signInData.user) {
      router.replace("/");
      router.refresh();
      return;
    }

    if (signInData.session?.access_token) {
      await fetch("/api/auth/last-login", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signInData.session.access_token}`,
        },
      }).catch((lastLoginError) => {
        console.error("[login] Last login update failed", lastLoginError);
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signInData.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      return;
    }

    const nextPath = searchParams.get("next");
    const destination =
      profile && !isAdminRole(profile.role)
        ? nextPath?.startsWith("/employee")
          ? nextPath
          : "/employee/dashboard"
        : nextPath || "/";

    router.replace(destination);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {!supabase && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Add Supabase env values before signing in.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={() => setIsResetOpen(true)}
            className="mt-3 text-sm font-semibold company-accent-link hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading || !supabase}
          className="company-primary-button w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {isResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-6 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-reset-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="password-reset-title"
                  className="text-xl font-bold text-slate-900"
                >
                  Reset your password
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter your email and we will send a password reset link if an
                  account exists.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResetOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close password reset"
                title="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <PasswordResetRequestForm initialEmail={email} />
          </div>
        </div>
      )}
    </>
  );
}
