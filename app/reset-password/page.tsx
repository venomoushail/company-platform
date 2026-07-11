import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter a new password for your employee training account."
    >
      <Suspense
        fallback={
          <p className="text-sm font-medium text-slate-600">
            Loading password reset...
          </p>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
