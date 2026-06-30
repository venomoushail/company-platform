import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold text-blue-700">
            Employee Training System
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Use the account created for you in Supabase Auth.
          </p>
        </div>

        <Suspense
          fallback={
            <p className="text-sm font-medium text-slate-600">
              Loading sign in...
            </p>
          }
        >
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
