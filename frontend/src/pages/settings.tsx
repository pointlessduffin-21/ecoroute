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
  Brain,
  Eye,
  EyeOff,
  Zap,
  AlertCircle,
  Loader2,
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

  // AI Configuration state
  const [aiSettings, setAiSettings] = useState({
    aiProvider: "none" as "gemini" | "openrouter" | "ollama" | "none",
    aiApiKey: "",
    aiModel: "",
    aiOllamaUrl: "http://localhost:11434",
  });
  const [aiSaved, setAiSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiTestMessage, setAiTestMessage] = useState("");

  // AI test connection mutation
  const testAiMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/ai/insights", { type: "general" });
      return res.data;
    },
    onSuccess: () => {
      setAiTestStatus("success");
      setAiTestMessage("Connection successful! AI provider is responding.");
      setTimeout(() => setAiTestStatus("idle"), 4000);
    },
    onError: (error: unknown) => {
      setAiTestStatus("error");
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to connect to AI provider. Check your API key and model.";
      setAiTestMessage(msg);
      setTimeout(() => setAiTestStatus("idle"), 6000);
    },
  });

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

      // AI Configuration
      if (configMap["ai_provider"] !== undefined) {
        setAiSettings(prev => ({
          ...prev,
          aiProvider: configMap["ai_provider"] as "gemini" | "openrouter" | "ollama" | "none",
        }));
      }
      if (configMap["ai_api_key"] !== undefined) {
        setAiSettings(prev => ({
          ...prev,
          aiApiKey: configMap["ai_api_key"],
        }));
      }
      if (configMap["ai_model"] !== undefined) {
        setAiSettings(prev => ({
          ...prev,
          aiModel: configMap["ai_model"],
        }));
      }
      if (configMap["ai_ollama_url"] !== undefined) {
        setAiSettings(prev => ({
          ...prev,
          aiOllamaUrl: configMap["ai_ollama_url"],
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

  const handleSaveAi = () => {
    saveConfigMutation.mutate([
      { key: "ai_provider", value: aiSettings.aiProvider },
      { key: "ai_api_key", value: aiSettings.aiApiKey },
      { key: "ai_model", value: aiSettings.aiModel },
      { key: "ai_ollama_url", value: aiSettings.aiOllamaUrl },
    ]);
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const getModelPlaceholder = () => {
    if (aiSettings.aiProvider === "gemini") return "gemini-2.0-flash";
    if (aiSettings.aiProvider === "openrouter") return "google/gemini-2.0-flash-001";
    if (aiSettings.aiProvider === "ollama") return "llama3.2";
    return "Select a provider first";
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

        {/* AI Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>AI Configuration</CardTitle>
                <CardDescription>
                  Configure AI provider for intelligent insights and predictions.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* AI Provider Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">AI Provider</label>
                <div className="flex flex-wrap gap-3">
                  {([
                    { value: "gemini" as const, label: "Google Gemini", description: "Direct Gemini API access" },
                    { value: "openrouter" as const, label: "OpenRouter", description: "Multi-provider gateway" },
                    { value: "ollama" as const, label: "Ollama", description: "Local AI (no API key needed)" },
                    { value: "none" as const, label: "Disabled", description: "AI features off" },
                  ] as const).map((provider) => (
                    <label
                      key={provider.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50",
                        aiSettings.aiProvider === provider.value &&
                          "border-primary bg-primary/5 ring-1 ring-primary"
                      )}
                    >
                      <input
                        type="radio"
                        name="ai_provider"
                        value={provider.value}
                        checked={aiSettings.aiProvider === provider.value}
                        onChange={(e) =>
                          setAiSettings({
                            ...aiSettings,
                            aiProvider: e.target.value as "gemini" | "openrouter" | "ollama" | "none",
                          })
                        }
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{provider.label}</p>
                        <p className="text-xs text-muted-foreground">{provider.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Provider config - Only show when provider is selected */}
              {aiSettings.aiProvider !== "none" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Ollama: URL instead of API key */}
                    {aiSettings.aiProvider === "ollama" ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Ollama URL</label>
                        <Input
                          value={aiSettings.aiOllamaUrl}
                          onChange={(e) =>
                            setAiSettings({
                              ...aiSettings,
                              aiOllamaUrl: e.target.value,
                            })
                          }
                          placeholder="http://localhost:11434"
                        />
                        <p className="text-xs text-muted-foreground">
                          URL of your running Ollama instance. No API key needed.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">API Key</label>
                        <div className="relative">
                          <Input
                            type={showApiKey ? "text" : "password"}
                            value={aiSettings.aiApiKey}
                            onChange={(e) =>
                              setAiSettings({
                                ...aiSettings,
                                aiApiKey: e.target.value,
                              })
                            }
                            placeholder="Enter your API key"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showApiKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Your API key is stored securely on the server.
                        </p>
                      </div>
                    )}

                    {/* Model Selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Model Name</label>
                      <Input
                        value={aiSettings.aiModel}
                        onChange={(e) =>
                          setAiSettings({
                            ...aiSettings,
                            aiModel: e.target.value,
                          })
                        }
                        placeholder={getModelPlaceholder()}
                      />
                      <p className="text-xs text-muted-foreground">
                        {aiSettings.aiProvider === "gemini"
                          ? "Default: gemini-2.0-flash"
                          : aiSettings.aiProvider === "ollama"
                            ? "Default: llama3.2 (run: ollama pull llama3.2)"
                            : "Default: google/gemini-2.0-flash-001"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Test Connection + Save */}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  {aiSettings.aiProvider !== "none" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAiTestStatus("loading");
                        testAiMutation.mutate();
                      }}
                      disabled={aiTestStatus === "loading" || !aiSettings.aiApiKey}
                    >
                      {aiTestStatus === "loading" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Test Connection
                        </>
                      )}
                    </Button>
                  )}
                  {aiTestStatus === "success" && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      {aiTestMessage}
                    </span>
                  )}
                  {aiTestStatus === "error" && (
                    <span className="flex items-center gap-1 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {aiTestMessage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {aiSaved && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      AI settings saved
                    </span>
                  )}
                  <Button onClick={handleSaveAi}>
                    <Save className="mr-2 h-4 w-4" />
                    Save AI Settings
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
