"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type RecoveryState = "checking" | "ready" | "missing" | "success";

function getHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();

  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function cleanRecoveryUrl() {
  window.history.replaceState(null, "", window.location.pathname);
}

function getReadableError(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const hasHandledRecoveryLink = useRef(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    if (!supabase || hasHandledRecoveryLink.current) return;

    const client = supabase;
    hasHandledRecoveryLink.current = true;

    async function establishRecoverySession() {
      setError(null);

      const urlError =
        searchParams.get("error_description") || searchParams.get("error");

      if (urlError) {
        setError(urlError);
        setRecoveryState("missing");
        return;
      }

      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } =
          await client.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(
            getReadableError(
              exchangeError,
              "This password setup link is invalid or expired."
            )
          );
          setRecoveryState("missing");
          return;
        }

        cleanRecoveryUrl();
        setRecoveryState("ready");
        return;
      }

      const hashParams = getHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashError =
        hashParams.get("error_description") || hashParams.get("error");

      if (hashError) {
        setError(hashError);
        setRecoveryState("missing");
        return;
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setError(
            getReadableError(
              sessionError,
              "This password setup link is invalid or expired."
            )
          );
          setRecoveryState("missing");
          return;
        }

        cleanRecoveryUrl();
        setRecoveryState("ready");
        return;
      }

      const { data: sessionData } = await client.auth.getSession();

      setRecoveryState(sessionData.session ? "ready" : "missing");
    }

    establishRecoverySession();
  }, [searchParams, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSuccessMessage(null);

    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      return;
    }

    if (!newPassword) {
      setError("Password is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Confirm password must match.");
      return;
    }

    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(
        getReadableError(updateError, "Unable to set your password.")
      );
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    setNewPassword("");
    setConfirmPassword("");
    setSuccessMessage("Your password has been set. You can now sign in.");
    setRecoveryState("success");
    setIsSubmitting(false);
  }

  if (!supabase) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
        Add Supabase env values before setting a password.
      </div>
    );
  }

  if (recoveryState === "checking") {
    return (
      <p className="text-sm font-medium text-slate-600">
        Checking password setup link...
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {successMessage}
        </div>
      )}

      {recoveryState === "missing" ? (
        <p className="text-sm leading-6 text-slate-600">
          Open the latest password setup email to continue. Password setup links
          can expire or be used only once.
        </p>
      ) : recoveryState === "success" ? (
        <Link
          href="/login"
          className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to sign in
        </Link>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="new-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? "Saving password..." : "Set Password"}
          </button>
        </form>
      )}
    </div>
  );
}
