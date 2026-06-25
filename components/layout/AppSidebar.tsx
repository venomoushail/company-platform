import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type AppSidebarProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

const navigation = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
  },
  {
    label: "Training",
    href: "/training",
    icon: GraduationCap,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default
 function AppSidebar({
  isCollapsed,
  onToggle,
}: AppSidebarProps) {
  return (
   <aside
  className={`relative sticky top-0 h-screen shrink-0 bg-slate-950 text-white transition-all duration-300 ${
    isCollapsed ? "w-20" : "w-64"
  }`}
>
      {/* Header */}
      <div className="border-b border-slate-800 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {isCollapsed ? "TA" : "Training Admin"}
            </h1>

            {!isCollapsed && (
              <p className="mt-1 text-sm text-slate-400">
                Employee Training System
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {isCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <ChevronLeft size={20} />
            )}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="space-y-2 p-4">
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <Icon size={22} strokeWidth={2} />

              {!isCollapsed && (
                <span className="font-medium">
                  {item.label}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* User */}
      <div className="absolute bottom-6 left-0 w-full px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-lg font-bold">
            N
          </div>

          {!isCollapsed && (
            <div>
              <p className="font-medium text-white">Nathan</p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}