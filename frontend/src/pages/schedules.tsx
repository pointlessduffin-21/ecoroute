import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { User, Subdivision, PaginatedResponse } from "@/types/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Plus,
  X,
  Zap,
  Clock,
  Trash2,
  User as UserIcon,
} from "lucide-react";

// --- Types ---

interface Schedule {
  id: string;
  userId: string;
  subdivisionId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user?: Pick<User, "id" | "fullName" | "email">;
}

interface AddShiftForm {
  userId: string;
  subdivisionId: string;
  days: number[];
  startTime: string;
  endTime: string;
}

interface OverrideForm {
  subdivisionId: string;
  userId: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
];

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function getTodayDayOfWeek(): number {
  return new Date().getDay();
}

// --- Component ---

export function SchedulesPage() {
  const queryClient = useQueryClient();

  // State
  const [selectedSubdivision, setSelectedSubdivision] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [addForm, setAddForm] = useState<AddShiftForm>({
    userId: "",
    subdivisionId: "",
    days: [],
    startTime: "07:00",
    endTime: "15:00",
  });
  const [overrideForm, setOverrideForm] = useState<OverrideForm>({
    subdivisionId: "",
    userId: "",
  });

  // --- Data fetching ---

  const { data: schedulesResponse, isLoading: schedulesLoading } = useQuery<{
    data: Schedule[];
  }>({
    queryKey: ["schedules", selectedSubdivision],
    queryFn: async () => {
      const params =
        selectedSubdivision !== "all"
          ? { subdivisionId: selectedSubdivision }
          : {};
      const res = await api.get("/schedules", { params });
      return res.data;
    },
  });

  const { data: usersResponse } = useQuery<PaginatedResponse<User>>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data;
    },
  });

  const { data: subdivisionsResponse } = useQuery<PaginatedResponse<Subdivision>>({
    queryKey: ["subdivisions"],
    queryFn: async () => {
      const res = await api.get("/subdivisions");
      return res.data;
    },
  });

  const schedules = schedulesResponse?.data ?? [];
  const allUsers = usersResponse?.data ?? [];
  const maintenanceUsers = allUsers.filter((u) => u.role === "maintenance");
  const subdivisions = subdivisionsResponse?.data ?? [];

  // --- Mutations ---

  const createScheduleMutation = useMutation({
    mutationFn: async (data: AddShiftForm) => {
      const res = await api.post("/schedules/bulk", {
        userId: data.userId,
        subdivisionId: data.subdivisionId,
        days: data.days,
        startTime: data.startTime,
        endTime: data.endTime,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      closeAddModal();
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const overrideGenerateMutation = useMutation({
    mutationFn: async (data: OverrideForm) => {
      const payload: Record<string, string> = {
        subdivisionId: data.subdivisionId,
      };
      if (data.userId) {
        payload.userId = data.userId;
      }
      const res = await api.post("/routes/override-generate", payload);
      return res.data;
    },
    onSuccess: () => {
      closeOverrideModal();
    },
  });

  // --- Helpers ---

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddForm({
      userId: "",
      subdivisionId: "",
      days: [],
      startTime: "07:00",
      endTime: "15:00",
    });
  };

  const closeOverrideModal = () => {
    setShowOverrideModal(false);
    setOverrideForm({ subdivisionId: "", userId: "" });
  };

  const toggleDay = (day: number) => {
    setAddForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addForm.days.length === 0 || !addForm.userId || !addForm.subdivisionId) return;
    createScheduleMutation.mutate(addForm);
  };

  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideForm.subdivisionId) return;
    overrideGenerateMutation.mutate(overrideForm);
  };

  // Group schedules by day of week for the calendar grid
  const schedulesByDay = useMemo(() => {
    const grouped: Record<number, Schedule[]> = {};
    for (const day of DAYS_OF_WEEK) {
      grouped[day.value] = [];
    }
    for (const schedule of schedules) {
      if (grouped[schedule.dayOfWeek]) {
        grouped[schedule.dayOfWeek].push(schedule);
      }
    }
    return grouped;
  }, [schedules]);

  // Today's schedules
  const todayDow = getTodayDayOfWeek();
  const todaysSchedules = schedules.filter((s) => s.dayOfWeek === todayDow);

  // Resolve user name from schedule
  const getUserName = (schedule: Schedule) => {
    if (schedule.user?.fullName) return schedule.user.fullName;
    const found = allUsers.find((u) => u.id === schedule.userId);
    return found?.fullName ?? "Unknown";
  };

  // Resolve subdivision name
  const getSubdivisionName = (id: string) => {
    const found = subdivisions.find((s) => s.id === id);
    return found?.name ?? "Unknown";
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Schedule Management
          </h1>
          <p className="text-muted-foreground">
            Manage maintenance crew shift schedules. Routes are auto-generated
            at shift start times.
          </p>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={selectedSubdivision}
          onChange={(e) => setSelectedSubdivision(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Subdivisions</option>
          {subdivisions.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2 sm:ml-auto">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Shift
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowOverrideModal(true)}
          >
            <Zap className="mr-2 h-4 w-4" />
            Override: Generate Route Now
          </Button>
        </div>
      </div>

      {/* Weekly Calendar Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekly Schedule
              </CardTitle>
              <CardDescription className="mt-1.5">
                Click the delete button on a shift card to remove it.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {schedulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={day.value}
                  className={cn(
                    "rounded-t-md border-b-2 px-2 py-2 text-center text-sm font-semibold",
                    day.value === todayDow
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                  {day.value === todayDow && (
                    <Badge variant="default" className="ml-1.5 text-[10px] px-1.5 py-0">
                      Today
                    </Badge>
                  )}
                </div>
              ))}

              {/* Day columns with shift cards */}
              {DAYS_OF_WEEK.map((day) => (
                <div
                  key={`col-${day.value}`}
                  className={cn(
                    "min-h-[140px] rounded-b-md border border-t-0 p-1.5 space-y-1.5",
                    day.value === todayDow
                      ? "border-primary/30 bg-primary/5"
                      : "border-border"
                  )}
                >
                  {schedulesByDay[day.value]?.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No shifts
                    </p>
                  ) : (
                    schedulesByDay[day.value]?.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="group relative rounded-md border bg-card p-2 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium leading-tight truncate pr-5">
                            {getUserName(schedule)}
                          </p>
                          <button
                            onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                            className="absolute top-1.5 right-1.5 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Delete shift"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime12(schedule.startTime)} -{" "}
                          {formatTime12(schedule.endTime)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Shifts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today's Shifts
          </CardTitle>
          <CardDescription>
            {DAYS_OF_WEEK.find((d) => d.value === todayDow)?.label} schedule
            overview.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todaysSchedules.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              No shifts scheduled for today.
            </p>
          ) : (
            <div className="space-y-3">
              {todaysSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{getUserName(schedule)}</p>
                      <p className="text-sm text-muted-foreground">
                        {getSubdivisionName(schedule.subdivisionId)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Shift: </span>
                      <span className="font-medium">
                        {formatTime12(schedule.startTime)} -{" "}
                        {formatTime12(schedule.endTime)}
                      </span>
                    </div>
                    <Badge variant={schedule.isActive ? "success" : "outline"}>
                      {schedule.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <button
                      onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete shift"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Shift Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeAddModal}
          />
          <Card className="relative z-10 w-full max-w-lg mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Add Shift</CardTitle>
                <button
                  onClick={closeAddModal}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CardDescription>
                Create a new maintenance shift schedule. Select multiple days to
                create shifts in bulk.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddSubmit} className="space-y-4">
                {/* Maintenance User */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Maintenance Worker
                  </label>
                  <select
                    value={addForm.userId}
                    onChange={(e) =>
                      setAddForm({ ...addForm, userId: e.target.value })
                    }
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select a worker...</option>
                    {maintenanceUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subdivision */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subdivision</label>
                  <select
                    value={addForm.subdivisionId}
                    onChange={(e) =>
                      setAddForm({ ...addForm, subdivisionId: e.target.value })
                    }
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select a subdivision...</option>
                    {subdivisions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Days of Week */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Days of Week</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                          addForm.days.includes(day.value)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-card text-foreground hover:bg-accent"
                        )}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>
                  {addForm.days.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Select at least one day.
                    </p>
                  )}
                </div>

                {/* Time Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <Input
                      type="time"
                      value={addForm.startTime}
                      onChange={(e) =>
                        setAddForm({ ...addForm, startTime: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Time</label>
                    <Input
                      type="time"
                      value={addForm.endTime}
                      onChange={(e) =>
                        setAddForm({ ...addForm, endTime: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                {/* Summary */}
                {addForm.days.length > 0 && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                    Will create{" "}
                    <span className="font-semibold text-foreground">
                      {addForm.days.length} shift
                      {addForm.days.length > 1 ? "s" : ""}
                    </span>{" "}
                    on{" "}
                    {addForm.days
                      .sort((a, b) => a - b)
                      .map(
                        (d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label
                      )
                      .join(", ")}
                    .
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeAddModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      createScheduleMutation.isPending ||
                      addForm.days.length === 0
                    }
                  >
                    {createScheduleMutation.isPending
                      ? "Creating..."
                      : `Create Shift${addForm.days.length > 1 ? "s" : ""}`}
                  </Button>
                </div>
                {createScheduleMutation.isError && (
                  <p className="text-sm text-destructive">
                    Failed to create schedule. Please try again.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Override Generate Route Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeOverrideModal}
          />
          <Card className="relative z-10 w-full max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Override: Generate Route
                </CardTitle>
                <button
                  onClick={closeOverrideModal}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CardDescription>
                Manually trigger a route generation outside the normal schedule.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleOverrideSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subdivision</label>
                  <select
                    value={overrideForm.subdivisionId}
                    onChange={(e) =>
                      setOverrideForm({
                        ...overrideForm,
                        subdivisionId: e.target.value,
                      })
                    }
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select a subdivision...</option>
                    {subdivisions.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Assign to Worker{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </label>
                  <select
                    value={overrideForm.userId}
                    onChange={(e) =>
                      setOverrideForm({
                        ...overrideForm,
                        userId: e.target.value,
                      })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Auto-assign</option>
                    {maintenanceUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeOverrideModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={overrideGenerateMutation.isPending}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {overrideGenerateMutation.isPending
                      ? "Generating..."
                      : "Generate Route Now"}
                  </Button>
                </div>
                {overrideGenerateMutation.isError && (
                  <p className="text-sm text-destructive">
                    Failed to generate route. Please try again.
                  </p>
                )}
                {overrideGenerateMutation.isSuccess && (
                  <p className="text-sm text-green-600">
                    Route generated successfully!
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
