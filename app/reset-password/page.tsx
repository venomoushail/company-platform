import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-blue-700">
          Employee Training System
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Set your password
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Enter a new password for your employee account.
        </p>

        <div className="mt-6">
          <Suspense
            fallback={
              <p className="text-sm font-medium text-slate-600">
                Loading password setup...
              </p>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
