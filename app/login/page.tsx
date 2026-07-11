import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      description="Use the account created for your employee training portal."
    >
      <Suspense
        fallback={
          <p className="text-sm font-medium text-slate-600">
            Loading sign in...
          </p>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
