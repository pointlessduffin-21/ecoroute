import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { BinsPage } from "@/pages/bins";
import { BinDetailsPage } from "@/pages/bin-details";
import { RoutesPage } from "@/pages/routes";
import { AlertsPage } from "@/pages/alerts";
import { UsersPage } from "@/pages/users";
import { AnalyticsPage } from "@/pages/analytics";
import { SettingsPage } from "@/pages/settings";
import { MyRoutesPage } from "@/pages/my-routes";
import { RouteExecutionPage } from "@/pages/route-execution";

import { SubdivisionsPage } from "@/pages/subdivisions";
import { ProfilePage } from "@/pages/profile";
import { AuditLogsPage } from "@/pages/audit-logs";
import { FeedbackPage } from "@/pages/feedback";
import { SchedulesPage } from "@/pages/schedules";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading EcoRoute...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="bins" element={<BinsPage />} />
        <Route path="bins/:id" element={<BinDetailsPage />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="my-routes" element={<MyRoutesPage />} />
        <Route path="routes/:routeId/execute" element={<RouteExecutionPage />} />
        <Route path="subdivisions" element={<SubdivisionsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
      </Route>
    </Routes>
  );
}
