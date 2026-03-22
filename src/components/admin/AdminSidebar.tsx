import { BarChart3, Radio, FolderOpen, Users, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

type Tab = "overview" | "live" | "past" | "users" | "settings";

const items: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "live", label: "Live Interviews", icon: Radio },
  { id: "past", label: "Past Interviews", icon: FolderOpen },
  { id: "users", label: "Users", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

const AdminSidebar = ({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-[hsl(240,10%,20%)] bg-[#111118]">
      <div className="flex items-center gap-2 px-5 py-5">
        <Logo />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-l-[3px] border-primary bg-primary/15 text-foreground"
                  : "border-l-[3px] border-transparent text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)]"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[hsl(240,10%,20%)] px-3 py-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)] transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
export type { Tab };
