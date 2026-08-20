"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, History } from "lucide-react";

interface ActivityLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  created_at: string;
}

interface OrgMember {
  user_id: string;
  profiles: { full_name: string | null; email: string | null };
}

const ACTION_LABELS: Record<string, string> = {
  create: "Creó",
  update: "Editó",
  delete: "Eliminó",
};

const ACTION_CLASSNAMES: Record<string, string> = {
  create: "border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  update: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  delete: "border-transparent bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
};

const ENTITY_LABELS: Record<string, string> = {
  contact: "Contacto",
  deal: "Trato",
  transaction: "Transacción",
  loan: "Préstamo",
  event: "Evento",
  task: "Tarea",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityLogPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("all");

  useEffect(() => {
    fetch("/api/org-members")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setMembers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (userId !== "all") params.set("userId", userId);
      const res = await fetch(`/api/activity-logs?${params.toString()}`);
      const body = await res.json();
      setLogs(res.ok && Array.isArray(body?.data) ? body.data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberLabel = (m: OrgMember) => m.profiles?.full_name || m.profiles?.email || m.user_id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-xs">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-xs">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Usuario</Label>
          <Select value={userId} onValueChange={(v) => setUserId(v ?? "all")}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los usuarios</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {memberLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void load()} disabled={loading} className="cursor-pointer">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Filtrar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-12 text-center">
          <History className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No hay registros para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {log.user_email ?? log.user_id ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={ACTION_CLASSNAMES[log.action] ?? ""} variant="outline">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.entity_name ? (
                      <>
                        <span className="font-medium">{log.entity_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {ENTITY_LABELS[log.entity_type] ?? log.entity_type}
                        {log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
