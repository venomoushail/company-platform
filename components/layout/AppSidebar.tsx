export default function AppSidebar() {
  return (
    <aside className="w-64 bg-slate-950 text-white">
      <div className="border-b border-slate-800 p-6">
        <h1 className="text-xl font-bold">Training Admin</h1>
        <p className="mt-1 text-sm text-slate-400">
          Employee Training System
        </p>
      </div>

      <nav className="space-y-1 p-4">
        <a
          href="#"
          className="block rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium"
        >
          Dashboard
        </a>

        <a
          href="#"
          className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          Employees
        </a>

        <a
          href="/training"
          className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          Training
        </a>

        <a
          href="#"
          className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          Reports
        </a>

        <a
          href="#"
          className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          Settings
        </a>
      </nav>
    </aside>
  );
}