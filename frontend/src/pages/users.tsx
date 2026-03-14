import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { User, PaginatedResponse } from "@/types/api";
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Search,
  Plus,
  X,
  Users,
  ShieldCheck,
  Radio,
  Truck,
  Pencil,
} from "lucide-react";

const ROLE_OPTIONS = ["all", "admin", "dispatcher", "driver"] as const;

type RoleFilter = (typeof ROLE_OPTIONS)[number];

const roleBadgeVariant = (role: User["role"]) => {
  switch (role) {
    case "admin":
      return "success" as const;
    case "dispatcher":
      return "info" as const;
    case "driver":
      return "secondary" as const;
  }
};

const roleIcon = (role: User["role"]) => {
  switch (role) {
    case "admin":
      return <ShieldCheck className="mr-1 h-3 w-3" />;
    case "dispatcher":
      return <Radio className="mr-1 h-3 w-3" />;
    case "driver":
      return <Truck className="mr-1 h-3 w-3" />;
  }
};

type ModalMode = "add" | "edit" | null;

interface EditFormData {
  fullName: string;
  email: string;
  role: User["role"];
  phone: string;
  isActive: boolean;
}

interface AddFormData {
  fullName: string;
  email: string;
  role: User["role"];
  password: string;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<AddFormData>({
    fullName: "",
    email: "",
    role: "driver",
    password: "",
  });
  const [editForm, setEditForm] = useState<EditFormData>({
    fullName: "",
    email: "",
    role: "driver",
    phone: "",
    isActive: true,
  });

  const { data: usersResponse, isLoading } = useQuery<PaginatedResponse<User>>(
    {
      queryKey: ["users"],
      queryFn: async () => {
        const res = await api.get("/users");
        return res.data;
      },
    }
  );

  const createUserMutation = useMutation({
    mutationFn: async (data: AddFormData) => {
      const res = await api.post("/users", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EditFormData> }) => {
      const res = await api.put(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeModal();
    },
  });

  const users = usersResponse?.data ?? [];

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      search === "" ||
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const closeModal = () => {
    setModalMode(null);
    setEditingUserId(null);
    setAddForm({ fullName: "", email: "", role: "driver", password: "" });
    setEditForm({ fullName: "", email: "", role: "driver", phone: "", isActive: true });
  };

  const openAddModal = () => {
    setModalMode("add");
  };

  const openEditModal = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      phone: user.phone ?? "",
      isActive: user.isActive,
    });
    setModalMode("edit");
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(addForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    updateUserMutation.mutate({
      id: editingUserId,
      data: {
        fullName: editForm.fullName,
        role: editForm.role,
        phone: editForm.phone || undefined,
        isActive: editForm.isActive,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            User Management
          </h1>
          <p className="text-muted-foreground">
            Manage system users, roles, and permissions.
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Users</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Admins</CardDescription>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === "admin").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Dispatchers</CardDescription>
            <Radio className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === "dispatcher").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Drivers</CardDescription>
            <Truck className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === "driver").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            A list of all users registered in the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filter Row */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role === "all"
                    ? "All Roles"
                    : role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Users Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-15" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="text-muted-foreground">No users found.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.fullName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={roleBadgeVariant(user.role)}
                          className="inline-flex items-center"
                        >
                          {roleIcon(user.role)}
                          {user.role.charAt(0).toUpperCase() +
                            user.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isActive ? "success" : "outline"}
                          className={cn(
                            !user.isActive && "text-muted-foreground"
                          )}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => openEditModal(user)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit User Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />
          <Card className="relative z-10 w-full max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {modalMode === "add" ? "Add New User" : "Edit User"}
                </CardTitle>
                <button
                  onClick={closeModal}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CardDescription>
                {modalMode === "add"
                  ? "Fill in the details to create a new user account."
                  : "Update the user's information."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modalMode === "add" ? (
                <form onSubmit={handleAddSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      placeholder="John Doe"
                      value={addForm.fullName}
                      onChange={(e) =>
                        setAddForm({ ...addForm, fullName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      placeholder="john@ecoroute.io"
                      value={addForm.email}
                      onChange={(e) =>
                        setAddForm({ ...addForm, email: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Role</label>
                    <select
                      value={addForm.role}
                      onChange={(e) =>
                        setAddForm({
                          ...addForm,
                          role: e.target.value as User["role"],
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="admin">Admin</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="driver">Driver</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={addForm.password}
                      onChange={(e) =>
                        setAddForm({ ...addForm, password: e.target.value })
                      }
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeModal}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createUserMutation.isPending}
                    >
                      {createUserMutation.isPending
                        ? "Creating..."
                        : "Create User"}
                    </Button>
                  </div>
                  {createUserMutation.isError && (
                    <p className="text-sm text-destructive">
                      Failed to create user. Please try again.
                    </p>
                  )}
                </form>
              ) : (
                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      value={editForm.fullName}
                      onChange={(e) =>
                        setEditForm({ ...editForm, fullName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={editForm.email}
                      disabled
                      className="opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Role</label>
                    <select
                      value={editForm.role}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          role: e.target.value as User["role"],
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="admin">Admin</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="driver">Driver</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      type="tel"
                      placeholder="+63-917-000-0000"
                      value={editForm.phone}
                      onChange={(e) =>
                        setEditForm({ ...editForm, phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium">Active</label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm({ ...editForm, isActive: !editForm.isActive })
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        editForm.isActive ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                          editForm.isActive ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {editForm.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeModal}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateUserMutation.isPending}
                    >
                      {updateUserMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </div>
                  {updateUserMutation.isError && (
                    <p className="text-sm text-destructive">
                      Failed to update user. Please try again.
                    </p>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
