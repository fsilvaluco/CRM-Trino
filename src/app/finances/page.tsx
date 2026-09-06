"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, FileText, ExternalLink, Check, Trash2, Loader2, TrendingUp, TrendingDown, DollarSign, User, Pencil, Sparkles, Layers, Filter, X
} from "lucide-react";
import { TransactionForm } from "@/components/finances/TransactionForm";
import { AttachReceiptDialog } from "@/components/finances/AttachReceiptDialog";
import { BulkReceiptDialog } from "@/components/finances/BulkReceiptDialog";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  currency: string;
  description: string | null;
  emisor: string | null;
  receptor: string | null;
  category: string | null;
  filePath: string | null;
  fileUrl: string | null;
  fileName: string | null;
  attachments?: { id: string; fileName: string | null; fileUrl: string | null; createdAt: string }[];
  responsibleUserId?: string | null;
  responsibleName: string | null;
  reimbursed: boolean;
  reimbursedAt: string | null;
  transactionDate: string | null;
  projectId: string | null;
  createdAt: string | number;
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

// Fecha real de la transacción para ordenar/filtrar: la del gasto si se
// cargó, si no la de creación del registro (mismo criterio que ya usa
// TransactionList para mostrarla).
function effectiveDate(t: Transaction): Date {
  if (t.transactionDate) return new Date(t.transactionDate);
  return typeof t.createdAt === "number"
    ? new Date(t.createdAt < 1e12 ? t.createdAt * 1000 : t.createdAt)
    : new Date(t.createdAt);
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function TransactionList({
  transactions,
  onEdit,
  onReimburse,
  onDelete,
}: {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
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
                <button
                  onClick={() => onEdit(t)}
                  className="text-sm font-medium hover:text-blue-600 transition-colors cursor-pointer text-left"
                  title="Clic para editar"
                >
                  {t.description}
                </button>
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
                        <Check className="h-2.5 w-2.5" /> Listo
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
              {t.filePath && t.fileUrl && (
                <a href={t.fileUrl} target="_blank" rel="noopener noreferrer" title="Ver comprobante">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
              {t.attachments && t.attachments.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {t.attachments.map((a, i) => (
                    a.fileUrl && (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={a.fileName ? `Comprobante ${i + 1}: ${a.fileName}` : `Comprobante ${i + 1}`}
                      >
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-600 hover:text-blue-700"
                title="Editar"
                onClick={() => onEdit(t)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {t.type === "expense" && t.responsibleName && !t.reimbursed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:text-green-700"
                  title="Marcar como listo"
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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showAttachReceipt, setShowAttachReceipt] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterEmisor, setFilterEmisor] = useState("");
  const [filterReceptor, setFilterReceptor] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

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

  const handleEdit = (transaction: Transaction) => {
    if (isAllProjects) {
      toast.warning("Selecciona el proyecto de este comprobante para editarlo");
      return;
    }
    setEditingTransaction(transaction);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
  };

  const handleReimburse = async (id: string, reimbursed: boolean) => {
    const res = await fetch(`/api/finances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reimbursed }),
    });
    if (!res.ok) { toast.error("Error al actualizar"); return; }
    toast.success("Marcado como listo");
    await loadTransactions();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este comprobante?")) return;
    const res = await fetch(`/api/finances/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Error al eliminar"); return; }
    toast.success("Comprobante eliminado");
    await loadTransactions();
  };

  // Categorías presentes en los datos reales (no la lista fija de
  // TransactionForm) -- así el filtro solo ofrece lo que de verdad se usó.
  const categoryOptions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.category).filter((c): c is string => Boolean(c)))).sort(),
    [transactions]
  );
  const emisorOptions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.emisor).filter((v): v is string => Boolean(v)))).sort(),
    [transactions]
  );
  const receptorOptions = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.receptor).filter((v): v is string => Boolean(v)))).sort(),
    [transactions]
  );

  const hasActiveFilters = Boolean(filterEmisor || filterReceptor || filterCategory || filterDateFrom || filterDateTo);
  const clearFilters = () => {
    setFilterEmisor(""); setFilterReceptor(""); setFilterCategory(""); setFilterDateFrom(""); setFilterDateTo("");
  };

  // Filtrado + orden por fecha (más reciente primero) -- se aplica antes
  // de separar por tipo, así KPIs y pestañas reflejan siempre lo filtrado.
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (filterEmisor && !(t.emisor ?? "").toLowerCase().includes(filterEmisor.toLowerCase())) return false;
        if (filterReceptor && !(t.receptor ?? "").toLowerCase().includes(filterReceptor.toLowerCase())) return false;
        if (filterCategory && t.category !== filterCategory) return false;
        const dateStr = toDateInputValue(effectiveDate(t));
        if (filterDateFrom && dateStr < filterDateFrom) return false;
        if (filterDateTo && dateStr > filterDateTo) return false;
        return true;
      })
      .sort((a, b) => effectiveDate(b).getTime() - effectiveDate(a).getTime());
  }, [transactions, filterEmisor, filterReceptor, filterCategory, filterDateFrom, filterDateTo]);

  const incomes = filteredTransactions.filter((t) => t.type === "income");
  const expenses = filteredTransactions.filter((t) => t.type === "expense");
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
        <div className="flex items-center gap-2">
          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            onClick={() => setShowFilters((v) => !v)}
            className="cursor-pointer"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros{hasActiveFilters ? ` (${[filterEmisor, filterReceptor, filterCategory, filterDateFrom, filterDateTo].filter(Boolean).length})` : ""}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (isAllProjects) {
                toast.warning("Selecciona un proyecto para adjuntar un comprobante");
                return;
              }
              setShowAttachReceipt(true);
            }}
            className="cursor-pointer"
            disabled={isAllProjects}
            title={isAllProjects ? "Selecciona un proyecto para adjuntar un comprobante" : undefined}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Adjuntar comprobante (IA)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (isAllProjects) {
                toast.warning("Selecciona un proyecto para hacer una carga masiva");
                return;
              }
              setShowBulkUpload(true);
            }}
            className="cursor-pointer"
            disabled={isAllProjects}
            title={isAllProjects ? "Selecciona un proyecto para hacer una carga masiva" : undefined}
          >
            <Layers className="h-4 w-4 mr-2" />
            Carga masiva
          </Button>
          <Button
            onClick={() => {
              if (isAllProjects) {
                toast.warning("Selecciona un proyecto para crear un comprobante");
                return;
              }
              setShowForm(true);
            }}
            className="cursor-pointer"
            disabled={isAllProjects}
            title={isAllProjects ? "Selecciona un proyecto para crear un comprobante" : undefined}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Comprobante
          </Button>
        </div>
      </div>

      {/* Filtros -- tipo tabla dinámica: emisor/receptor (texto libre con
          sugerencias de lo ya cargado), categoría, rango de fecha. Se
          aplican sobre la fecha efectiva (la del gasto, o si no la de
          creación) antes de separar por tipo, así KPIs/pestañas siempre
          reflejan lo filtrado. */}
      {showFilters && (
        <div className="rounded-xl border bg-card p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Emisor</Label>
            <Input
              list="finances-emisor-options"
              value={filterEmisor}
              onChange={(e) => setFilterEmisor(e.target.value)}
              placeholder="Quién envió"
              className="h-9"
            />
            <datalist id="finances-emisor-options">
              {emisorOptions.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Receptor</Label>
            <Input
              list="finances-receptor-options"
              value={filterReceptor}
              onChange={(e) => setFilterReceptor(e.target.value)}
              placeholder="Quién recibió"
              className="h-9"
            />
            <datalist id="finances-receptor-options">
              {receptorOptions.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Categoría</Label>
            <Select value={filterCategory || "__all__"} onValueChange={(v) => setFilterCategory(!v || v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 cursor-pointer w-full">
                <SelectValue>{filterCategory || "Todas"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5 flex gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive" title="Limpiar filtros" onClick={clearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

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
            <DollarSign className="h-3 w-3" /> Pendientes
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
            <TabsTrigger value="all">Todos ({filteredTransactions.length})</TabsTrigger>
            <TabsTrigger value="expense">Gastos ({expenses.length})</TabsTrigger>
            <TabsTrigger value="income">Ingresos ({incomes.length})</TabsTrigger>
            {pendingReimbursements.length > 0 && (
              <TabsTrigger value="pending">
                Pendientes ({pendingReimbursements.length})
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <TransactionList transactions={filteredTransactions} onEdit={handleEdit} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="expense" className="mt-4">
            <TransactionList transactions={expenses} onEdit={handleEdit} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="income" className="mt-4">
            <TransactionList transactions={incomes} onEdit={handleEdit} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="pending" className="mt-4">
            <TransactionList transactions={pendingReimbursements} onEdit={handleEdit} onReimburse={handleReimburse} onDelete={handleDelete} />
          </TabsContent>
        </Tabs>
      )}

      <TransactionForm
        open={showForm}
        onClose={handleCloseForm}
        onCreated={loadTransactions}
        initialData={editingTransaction ? {
          id: editingTransaction.id,
          type: editingTransaction.type,
          amount: editingTransaction.amount,
          description: editingTransaction.description,
          emisor: editingTransaction.emisor,
          receptor: editingTransaction.receptor,
          category: editingTransaction.category,
          transactionDate: editingTransaction.transactionDate,
          responsibleUserId: editingTransaction.responsibleUserId ?? null,
          responsibleName: editingTransaction.responsibleName,
          reimbursed: editingTransaction.reimbursed,
          filePath: editingTransaction.filePath,
          fileUrl: editingTransaction.fileUrl,
          fileName: editingTransaction.fileName,
        } : undefined}
      />

      <AttachReceiptDialog
        open={showAttachReceipt}
        onClose={() => setShowAttachReceipt(false)}
        onDone={loadTransactions}
        projectId={activeProjectId}
      />

      <BulkReceiptDialog
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onDone={loadTransactions}
        projectId={activeProjectId}
      />
    </div>
  );
}
