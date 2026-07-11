"use client";

import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const resetSuccessMessage =
  "If an account exists for that email, a password reset link has been sent.";

function getResetRedirectUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/reset-password`;
  }

  const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  return fallbackUrl ? `${fallbackUrl}/reset-password` : "/reset-password";
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

export default function PasswordResetRequestForm({
  initialEmail = "",
}: {
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setMessage(null);

    if (!supabase) {
      setError("Supabase environment variables are not configured.");
      return;
    }

    setIsSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: getResetRedirectUrl(),
      }
    );

    setIsSubmitting(false);

    if (resetError) {
      setError(
        getReadableError(resetError, "Unable to send a password reset link.")
      );
      return;
    }

    setMessage(resetSuccessMessage);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!supabase && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Add Supabase env values before requesting a password reset.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {message}
        </div>
      )}

      <div>
        <label
          htmlFor="reset-email"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Email
        </label>
        <input
          id="reset-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="company-focus w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !supabase}
        className="company-primary-button w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? "Sending reset link..." : "Send reset link"}
      </button>
    </form>
  );
}
