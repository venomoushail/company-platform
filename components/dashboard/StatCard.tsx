interface StatCardProps {
  title: string;
  value: string | number;
  valueColor?: string;
}

export default function StatCard({
  title,
  value,
  valueColor = "text-slate-900",
}: StatCardProps) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className={`mt-3 text-3xl font-bold ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}