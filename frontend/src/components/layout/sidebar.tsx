import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Trash2,
  Route,
  Users,
  Bell,
  Settings,
  LogOut,
  MapPin,
  BarChart3,
  Truck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
  maintenanceOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/bins", icon: Trash2, label: "Smart Bins" },
  { to: "/routes", icon: Route, label: "Routes" },
  { to: "/my-routes", icon: Truck, label: "My Routes", maintenanceOnly: true },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/users", icon: Users, label: "Users", adminOnly: true },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/subdivisions", icon: MapPin, label: "Subdivisions", adminOnly: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { user, logout, isAdmin, isMaintenance } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Trash2 className="h-4 w-4" />
        </div>
        <span className="text-lg font-bold text-foreground">EcoRoute</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems
          .filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.maintenanceOnly && !isMaintenance) return false;
            return true;
          })
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-hover"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
            {user?.fullName?.charAt(0) ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
