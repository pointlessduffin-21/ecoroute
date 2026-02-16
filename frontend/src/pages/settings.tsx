import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Settings,
  Building2,
  Gauge,
  Bell,
  Save,
  CheckCircle,
} from "lucide-react";

export function SettingsPage() {
  const queryClient = useQueryClient();

  // Fetch settings from the backend
  const { data: configData } = useQuery({
    queryKey: ["system-config"],
    queryFn: async () => {
      const res = await api.get("/system-config");
      return res.data;
    },
  });

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (configs: { key: string; value: string }[]) => {
      await Promise.all(
        configs.map(cfg => api.put("/system-config", { configKey: cfg.key, configValue: cfg.value }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
    },
  });

  // General Settings state
  const [generalSettings, setGeneralSettings] = useState({
    subdivisionName: "Downtown District",
    depotAddress: "123 Main Street, Greenville, SC 29601",
  });
  const [generalSaved, setGeneralSaved] = useState(false);

  // Threshold Configuration state
  const [thresholdSettings, setThresholdSettings] = useState({
    defaultFillThreshold: 80,
    lowBatteryVoltage: 3.2,
  });
  const [thresholdSaved, setThresholdSaved] = useState(false);

  // Notification Preferences state
  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    pushAlerts: true,
    smsAlerts: false,
  });
  const [notificationSaved, setNotificationSaved] = useState(false);

  // Initialize local state from fetched config
  useEffect(() => {
    if (configData) {
      const configMap: Record<string, string> = {};
      if (Array.isArray(configData)) {
        for (const item of configData) {
          configMap[item.configKey ?? item.key] = item.configValue ?? item.value;
        }
      } else if (configData.data && Array.isArray(configData.data)) {
        for (const item of configData.data) {
          configMap[item.configKey ?? item.key] = item.configValue ?? item.value;
        }
      }

      if (configMap["subdivision_name"] !== undefined) {
        setGeneralSettings(prev => ({
          ...prev,
          subdivisionName: configMap["subdivision_name"],
        }));
      }
      if (configMap["depot_address"] !== undefined) {
        setGeneralSettings(prev => ({
          ...prev,
          depotAddress: configMap["depot_address"],
        }));
      }
      if (configMap["default_fill_threshold"] !== undefined) {
        setThresholdSettings(prev => ({
          ...prev,
          defaultFillThreshold: Number(configMap["default_fill_threshold"]),
        }));
      }
      if (configMap["low_battery_voltage"] !== undefined) {
        setThresholdSettings(prev => ({
          ...prev,
          lowBatteryVoltage: Number(configMap["low_battery_voltage"]),
        }));
      }
      if (configMap["email_alerts"] !== undefined) {
        setNotificationSettings(prev => ({
          ...prev,
          emailAlerts: configMap["email_alerts"] === "true",
        }));
      }
      if (configMap["push_alerts"] !== undefined) {
        setNotificationSettings(prev => ({
          ...prev,
          pushAlerts: configMap["push_alerts"] === "true",
        }));
      }
      if (configMap["sms_alerts"] !== undefined) {
        setNotificationSettings(prev => ({
          ...prev,
          smsAlerts: configMap["sms_alerts"] === "true",
        }));
      }
    }
  }, [configData]);

  const handleSaveGeneral = () => {
    saveConfigMutation.mutate([
      { key: "subdivision_name", value: generalSettings.subdivisionName },
      { key: "depot_address", value: generalSettings.depotAddress },
    ]);
    setGeneralSaved(true);
    setTimeout(() => setGeneralSaved(false), 2000);
  };

  const handleSaveThresholds = () => {
    saveConfigMutation.mutate([
      { key: "default_fill_threshold", value: String(thresholdSettings.defaultFillThreshold) },
      { key: "low_battery_voltage", value: String(thresholdSettings.lowBatteryVoltage) },
    ]);
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2000);
  };

  const handleSaveNotifications = () => {
    saveConfigMutation.mutate([
      { key: "email_alerts", value: String(notificationSettings.emailAlerts) },
      { key: "push_alerts", value: String(notificationSettings.pushAlerts) },
      { key: "sms_alerts", value: String(notificationSettings.smsAlerts) },
    ]);
    setNotificationSaved(true);
    setTimeout(() => setNotificationSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">
          Configure system-wide preferences and thresholds.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Basic information about your subdivision and operations.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subdivision Name</label>
                <Input
                  value={generalSettings.subdivisionName}
                  onChange={(e) =>
                    setGeneralSettings({
                      ...generalSettings,
                      subdivisionName: e.target.value,
                    })
                  }
                  placeholder="Enter subdivision name"
                />
                <p className="text-xs text-muted-foreground">
                  The display name for your subdivision in reports and
                  dashboards.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Depot Address</label>
                <Input
                  value={generalSettings.depotAddress}
                  onChange={(e) =>
                    setGeneralSettings({
                      ...generalSettings,
                      depotAddress: e.target.value,
                    })
                  }
                  placeholder="Enter depot address"
                />
                <p className="text-xs text-muted-foreground">
                  Starting point for route optimization calculations.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              {generalSaved && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Settings saved
                </span>
              )}
              <Button onClick={handleSaveGeneral}>
                <Save className="mr-2 h-4 w-4" />
                Save General Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Threshold Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Threshold Configuration</CardTitle>
                <CardDescription>
                  Define alert thresholds for bin monitoring.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Default Fill Threshold (%)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={50}
                    max={100}
                    value={thresholdSettings.defaultFillThreshold}
                    onChange={(e) =>
                      setThresholdSettings({
                        ...thresholdSettings,
                        defaultFillThreshold: Number(e.target.value),
                      })
                    }
                    className="w-24"
                  />
                  <div className="flex-1">
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          thresholdSettings.defaultFillThreshold >= 90
                            ? "bg-red-500"
                            : thresholdSettings.defaultFillThreshold >= 75
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        )}
                        style={{
                          width: `${thresholdSettings.defaultFillThreshold}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Alert triggers when bin fill level exceeds this percentage.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Low Battery Voltage Threshold (V)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={2.0}
                    max={4.2}
                    step={0.1}
                    value={thresholdSettings.lowBatteryVoltage}
                    onChange={(e) =>
                      setThresholdSettings({
                        ...thresholdSettings,
                        lowBatteryVoltage: Number(e.target.value),
                      })
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    Typical range: 2.8V - 4.2V
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Alert triggers when battery drops below this voltage.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              {thresholdSaved && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Thresholds saved
                </span>
              )}
              <Button onClick={handleSaveThresholds}>
                <Save className="mr-2 h-4 w-4" />
                Save Thresholds
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose how you receive alert notifications.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Email Toggle */}
              <label className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Email Alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Receive alert notifications via email.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationSettings.emailAlerts}
                  onClick={() =>
                    setNotificationSettings({
                      ...notificationSettings,
                      emailAlerts: !notificationSettings.emailAlerts,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    notificationSettings.emailAlerts
                      ? "bg-primary"
                      : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      notificationSettings.emailAlerts
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </label>

              {/* Push Toggle */}
              <label className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Push Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Receive real-time push notifications in browser.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationSettings.pushAlerts}
                  onClick={() =>
                    setNotificationSettings({
                      ...notificationSettings,
                      pushAlerts: !notificationSettings.pushAlerts,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    notificationSettings.pushAlerts
                      ? "bg-primary"
                      : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      notificationSettings.pushAlerts
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </label>

              {/* SMS Toggle */}
              <label className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">SMS Alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Receive critical alerts via SMS text messages.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationSettings.smsAlerts}
                  onClick={() =>
                    setNotificationSettings({
                      ...notificationSettings,
                      smsAlerts: !notificationSettings.smsAlerts,
                    })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    notificationSettings.smsAlerts
                      ? "bg-primary"
                      : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      notificationSettings.smsAlerts
                        ? "translate-x-5"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              {notificationSaved && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Preferences saved
                </span>
              )}
              <Button onClick={handleSaveNotifications}>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
