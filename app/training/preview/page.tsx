import AdminLayout from "@/components/layout/AdminLayout";

export default function TrainingPreviewPage() {
  return (
    <AdminLayout
      title="Training Preview"
      description="Open a saved training to preview the employee experience."
    >
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-semibold text-amber-900">Choose a training to preview</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          This page no longer shows demo content. Open a training in the builder and
          use Preview so the saved draft can be loaded exactly.
        </p>
        <a
          href="/training"
          className="mt-4 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
        >
          Go to Training Library
        </a>
      </div>
    </AdminLayout>
  );
}
