import AdminLayout from "@/components/layout/AdminLayout";

const trainingModules = [
  {
    title: "Hospitality 101",
    category: "Customer Service",
    audience: "All Employees",
    status: "Published",
    estimatedMinutes: 15,
  },
  {
    title: "Opening Procedures",
    category: "Operations",
    audience: "Managers",
    status: "Draft",
    estimatedMinutes: 20,
  },
  {
    title: "Food Safety Basics",
    category: "Safety",
    audience: "All Employees",
    status: "Published",
    estimatedMinutes: 25,
  },
];

export default function TrainingPage() {
  return (
    <AdminLayout
      title="Training"
      description="Create and manage employee training modules."
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Training Modules
          </h2>
          <p className="text-sm text-slate-500">
            Manage courses, quizzes, passing scores, and renewal rules.
          </p>
        </div>

        <a
  href="/training/new"
  className="company-primary-button rounded-lg px-4 py-2 text-sm font-semibold"
>
  + Add Training
</a>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Title
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Category
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Audience
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Time
              </th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {trainingModules.map((module) => (
              <tr
                key={module.title}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-6 py-4">
                  <p className="font-medium text-slate-900">
                    {module.title}
                  </p>
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {module.category}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {module.audience}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {module.estimatedMinutes} min
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      module.status === "Published"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {module.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
