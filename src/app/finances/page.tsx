"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, FileText, ExternalLink, Check, Trash2, Loader2, TrendingUp, TrendingDown, DollarSign, User
} from "lucide-react";
import { TransactionForm } from "@/components/finances/TransactionForm";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: string;
  description: string | null;
  category: string | null;
  fileUrl: string | null;
  fileName: string | null;
  responsibleName: string | null;
  reimbursed: boolean;
  reimbursedAt: string | null;
  transactionDate: string | null;
  projectId: string | null;
  createdAt: string | number;
}

interface Member {
  user_id: string;
  name: string;
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

function TransactionList({
  transactions,
  onReimburse,
  onDelete,
}: {
  transactions: Transaction[];
  onReimburse: (id: string, reimbursed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Sin comprobantes registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((t) => {
        const date = typeof t.createdAt === "number"
          ? new Date(t.createdAt < 1e12 ? t.createdAt * 1000 : t.createdAt)
          : new Date(t.createdAt);

        const displayDate = t.transactionDate
          ? new Date(t.transactionDate)
          : date;

        return (
          <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
            {/* Ícono tipo */}
            <div className={`mt-0.5 p-1.5 rounded-md shrink-0 ${t.type === "income" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
              {t.type === "income" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{t.description}</span>
                {t.category && <Badge variant="outline" className="text-xs px-1.5 py-0">{t.category}</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className={`text-sm font-semibold ${t.type === "income" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {t.type === "expense" ? "-" : "+"}{formatCLP(t.amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(displayDate, "d MMM yyyy", { locale: es })}
                  {t.transactionDate && (
                    <span className="ml-1 text-muted-foreground/60">(fecha del gasto)</span>
                  )}
                </span>
                {t.responsibleName && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />{t.responsibleName}
                    {t.reimbursed ? (
                      <Badge className="text-[10px] px-1.5 py-0 ml-1 bg-green-600 text-white flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" /> Reembolsado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1 text-muted-foreground border-dashed">
                        Pendiente
                      </Badge>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-1 shrink-0">
              {t.fileUrl && (
                <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
              {t.type === "expense" && t.responsibleName && !t.reimbursed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:text-green-700"
                  title="Marcar como reembolsado"
                  onClick={() => onReimburse(t.id, true)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Eliminar"
                onClick={() => onDelete(t.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function FinancesPage() {
  const { user } = useAuth();
  const { activeProject, isAllProjects } = useProject();
  const activeProjectId = activeProject?.id ?? null;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Cargar miembros de la org
  useEffect(() => {
    if (!user) return;
    supabase
      .from("organization_members")
      .select("user_id, profiles ( full_name, email )")
      .then(({ data }) => {
        const list = (data ?? []).map((m) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return {
            user_id: m.user_id,
            name: (p as { full_name?: string; email?: string } | null)?.full_name
              || (p as { full_name?: string; email?: string } | null)?.email
              || m.user_id,
          };
        });
        setMembers(list);
      });
  }, [user]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAllProjects && activeProjectId) params.set("projectId", activeProjectId);

      const res = await fetch(`/api/finances?${params}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      // Preserva transacciones previas si la carga falla transitoriamente
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, isAllProjects]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadTransactions();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadTransactions]);

  const handleReimburse = async (id: string, reimbursed: boolean) => {
    const res = await fetch(`/api/finances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reimbursed }),
    });
    if (!res.ok) { toast.error("Error al actualizar"); return; }
    toast.success("Marcado como reembolsado");
    await loadTransactions();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este comprobante?")) return;
    const res = await fetch(`/api/finances/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Error al eliminar"); return; }
    toast.success("Comprobante eliminado");
    await loadTransactions();
  };

  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const pendingReimbursements = expenses.filter((t) => t.responsibleName && !t.reimbursed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-muted-foreground text-sm">
            {isAllProjects || !activeProject ? "Todos los proyectos" : `Proyecto: ${activeProject.name}`}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Comprobante
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Ingresos</p>
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCLP(totalIncome)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Gastos</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{formatCLP(totalExpense)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Balance</p>
          <p className={`text-lg font-bold ${balance >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {formatCLP(balance)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Devoluciones pendientes
          </p>
          <p className="text-lg font-bold">{pendingReimbursements.length}</p>
          {pendingReimbursements.length > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {formatCLP(pendingReimbursements.reduce((s, t) => s + t.amount, 0))}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todos ({transactions.length})</TabsTrigger>
            <TabsTrigger value="expense">Gastos ({expenses.length})</TabsTrigger>
            <TabsTrigger value="income">Ingresos ({incomes.length})</TabsTrigger>
            {pendingReimbursements.length > 0 && (
              <TabsTrigger value="pending">
                Devoluciones pendientes ({pendingReimbursements.length})
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <TransactionList transactions={transactions} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="expense" className="mt-4">
            <TransactionList transactions={expenses} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="income" className="mt-4">
            <TransactionList transactions={incomes} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="pending" className="mt-4">
            <TransactionList transactions={pendingReimbursements} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
        </Tabs>
      )}

      <TransactionForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={loadTransactions}
        members={members}
      />
    </div>
  );
}
