export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-slate-950 text-white">
          <div className="border-b border-slate-800 p-6">
            <h1 className="text-xl font-bold">Training Admin</h1>
            <p className="mt-1 text-sm text-slate-400">Employee Training System</p>
          </div>

          <nav className="space-y-1 p-4">
            <a className="block rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium" href="#">
              Dashboard
            </a>
            <a className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800" href="#">
              Employees
            </a>
            <a className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800" href="#">
              Training
            </a>
            <a className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800" href="#">
              Reports
            </a>
            <a className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800" href="#">
              Settings
            </a>
          </nav>
        </aside>

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
            <p className="mt-1 text-sm text-slate-500">
              Overview of employee training activity and completion.
            </p>
          </header>

          <div className="p-8">
            <div className="grid gap-6 md:grid-cols-4">
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Employees</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">128</p>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Training Modules</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">12</p>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Completion Rate</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">84%</p>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Past Due</p>
                <p className="mt-3 text-3xl font-bold text-red-600">9</p>
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-xl bg-white p-6 shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Recent Training Activity</h3>
                  <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    View All
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {[
                    ["Sarah Jenkins", "Completed Hospitality 101", "Today"],
                    ["Mike Thompson", "Passed Food Safety Quiz", "Yesterday"],
                    ["Alex Carter", "Started Opening Procedures", "2 days ago"],
                  ].map(([name, activity, time]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{name}</p>
                        <p className="text-sm text-slate-500">{activity}</p>
                      </div>
                      <p className="text-sm text-slate-400">{time}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Quick Actions</h3>

                <div className="mt-5 space-y-3">
                  <button className="w-full rounded-lg bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-700">
                    + Add Employee
                  </button>
                  <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-800">
                    + Add Training
                  </button>
                  <button className="w-full rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    View Reports
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}