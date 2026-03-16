import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
} from "lucide-react";

interface AuditLogEntry {
  id: number;
  userId: string | null;
  entityId: string | null;
  entityType: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const actionBadgeVariant = (action: string) => {
  const upper = action.toUpperCase();
  if (upper === "POST" || upper === "CREATE") return "success" as const;
  if (upper === "PUT" || upper === "PATCH" || upper === "UPDATE")
    return "warning" as const;
  if (upper === "DELETE") return "destructive" as const;
  return "outline" as const;
};

export function AuditLogsPage() {
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const limit = 50;

  const { data: response, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: ["audit-logs", page],
    queryFn: async () => {
      const res = await api.get(
        `/audit-logs?limit=${limit}&offset=${page * limit}`
      );
      return res.data;
    },
  });

  const logs = response?.data ?? [];
  const total = response?.pagination?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const toggleRow = (id: number) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const renderJson = (value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    try {
      const str =
        typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
          {str}
        </pre>
      );
    } catch {
      return <span className="text-muted-foreground">Unable to parse</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          View a chronological record of all system mutations.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Entries</CardDescription>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Current Page</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPages > 0 ? page + 1 : 0} / {totalPages}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Showing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {logs.length} entries
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Audit Logs</CardTitle>
          <CardDescription>
            Click a row to expand and view old/new value JSON diffs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">No audit logs found.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <>
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleRow(log.id)}
                      >
                        <TableCell>
                          {expandedRow === log.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">
                              {log.userName ?? "System"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.userEmail ?? "N/A"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionBadgeVariant(log.action)}>
                            {log.action.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.entityType}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">
                          {log.entityId ?? "N/A"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {log.ipAddress ?? "N/A"}
                        </TableCell>
                      </TableRow>
                      {expandedRow === log.id && (
                        <TableRow key={`${log.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  Old Value
                                </p>
                                {renderJson(log.oldValue)}
                              </div>
                              <div>
                                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  New Value
                                </p>
                                {renderJson(log.newValue)}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * limit + 1} -{" "}
                    {Math.min((page + 1) * limit, total)} of {total} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(0)}
                      disabled={page === 0}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
