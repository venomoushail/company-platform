import AdminLayout from "@/components/layout/AdminLayout";
import StatCard from "@/components/dashboard/StatCard";

export default function Home() {
  return (
  <AdminLayout
    title="Dashboard"
    description="Overview of employee training activity and completion."
  >
    <div className="grid gap-6 md:grid-cols-4">
      <StatCard title="Employees" value="128" />
      <StatCard title="Training Modules" value="12" />
      <StatCard title="Completion Rate" value="84%" />
      <StatCard
        title="Past Due"
        value="9"
        valueColor="text-red-600"
      />
    </div>
  </AdminLayout>
);
}