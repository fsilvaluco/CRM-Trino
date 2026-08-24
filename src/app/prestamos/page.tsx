"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { toast } from "sonner";
import {
  Plus, Trash2, Loader2, Landmark, HandCoins, Paperclip, ExternalLink, ChevronDown, ChevronRight, Pencil,
} from "lucide-react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
function formatCents(cents: number): string {
  return CLP.format(cents / 100);
}

interface Repayment {
  id: string;
  amount: number;
  repaymentDate: string | null;
  comprobanteUrl: string | null;
  notes: string | null;
  createdAt: string;
}

interface Loan {
  id: string;
  lenderName: string;
  // Qué artista consiguió este préstamo (ej. "SoloNacho") -- distinto del
  // prestamista, que puede ser un tercero (su empresa, un familiar).
  responsibleName: string | null;
  principalAmount: number;
  received: boolean;
  receivedAt: string | null;
  holderRut: string | null;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  contactEmail: string | null;
  repaidAmount: number;
  outstandingAmount: number;
  repayments: Repayment[];
}

interface Contribution {
  id: string;
  contributorName: string;
  amount: number;
  contributionDate: string | null;
  comprobanteUrl: string | null;
  notes: string | null;
  createdAt: string;
}

async function uploadReceipt(file: File, prefix: string): Promise<string | null> {
  if (file.size > 25 * 1024 * 1024) {
    toast.error("El archivo no puede superar 25 MB");
    return null;
  }
  const ext = file.name.split(".").pop();
  const storagePath = `${prefix}/${Date.now()}.${ext}`;
  const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
  if (uploadResult.error) {
    toast.error("Error subiendo el archivo: " + uploadResult.error.message);
    return null;
  }
  const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
  return data.publicUrl;
}

// Nuevo préstamo (prestamista)
// Crear o editar un préstamo -- mismo diálogo para los dos casos
// (`editingLoan` viene seteado cuando es edición).
function LoanFormDialog({ open, onClose, projectId, editingLoan, onSaved }: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editingLoan: Loan | null;
  onSaved: () => void;
}) {
  const [lenderName, setLenderName] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState(false);
  const [holderRut, setHolderRut] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLenderName(editingLoan?.lenderName ?? "");
    setResponsibleName(editingLoan?.responsibleName ?? "");
    setAmount(editingLoan ? String(editingLoan.principalAmount / 100) : "");
    setReceived(editingLoan?.received ?? false);
    setHolderRut(editingLoan?.holderRut ?? "");
    setBankName(editingLoan?.bankName ?? "");
    setAccountType(editingLoan?.accountType ?? "");
    setAccountNumber(editingLoan?.accountNumber ?? "");
    setContactEmail(editingLoan?.contactEmail ?? "");
  }, [open, editingLoan]);

  async function handleSave() {
    const pesos = parseInt(amount.replace(/\D/g, ""), 10);
    if (!lenderName.trim() || !Number.isFinite(pesos) || pesos <= 0) {
      toast.error("Completa el nombre del prestamista y un monto válido");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        lenderName: lenderName.trim(),
        responsibleName: responsibleName.trim() || null,
        principalAmount: pesos * 100,
        received,
        holderRut: holderRut.trim() || null,
        bankName: bankName.trim() || null,
        accountType: accountType.trim() || null,
        accountNumber: accountNumber.trim() || null,
        contactEmail: contactEmail.trim() || null,
      };
      const res = editingLoan
        ? await fetch(`/api/loans/${editingLoan.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/loans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, projectId }),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editingLoan ? "Préstamo actualizado" : "Préstamo registrado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingLoan ? "Editar préstamo" : "Nuevo préstamo"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Prestamista (a quién se le debe)</label>
            <Input placeholder="ej. Miguel Galindo" value={lenderName} onChange={(e) => setLenderName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Responsable (qué artista lo consiguió)</label>
            <Input placeholder="ej. SoloNacho" value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Monto prestado</label>
            <MoneyInput placeholder="$0" value={amount} onChange={setAmount} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={received} onCheckedChange={(v) => setReceived(Boolean(v))} />
            Ya se recibió esta plata
          </label>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Datos bancarios (para la transferencia de vuelta)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">RUT</label>
                <Input placeholder="13.275.278-8" value={holderRut} onChange={(e) => setHolderRut(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Banco</label>
                <Input placeholder="BCI Mach" value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tipo de cuenta</label>
                <Input placeholder="Cuenta corriente" value={accountType} onChange={(e) => setAccountType(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">N° de cuenta</label>
                <Input placeholder="15133150" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input placeholder="correo@ejemplo.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <Button className="w-full cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Registrar abono a un prestamista
function RepaymentDialog({ open, onClose, loanId, onCreated }: { open: boolean; onClose: () => void; loanId: string | null; onCreated: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const url = await uploadReceipt(file, "loan-repayments");
    if (url) { setComprobanteUrl(url); toast.success("Comprobante adjuntado"); }
    setUploading(false);
  }

  async function handleSave() {
    if (!loanId) return;
    const pesos = parseInt(amount.replace(/\D/g, ""), 10);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/loans/${loanId}/repayments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: pesos * 100, repaymentDate: date || null, comprobanteUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Abono registrado");
      setAmount(""); setDate(""); setComprobanteUrl(null);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Registrar abono al prestamista</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Monto</label>
            <MoneyInput placeholder="$0" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Comprobante</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" id="repayment-file" onChange={handleFile} />
            <Button type="button" variant="outline" className="w-full justify-start gap-2 cursor-pointer" disabled={uploading} onClick={() => document.getElementById("repayment-file")?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {comprobanteUrl ? "Comprobante adjuntado" : "Subir comprobante"}
            </Button>
          </div>
          <Button className="w-full cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar abono"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Nuevo aporte (plata que juntan los artistas para pagarle a los prestamistas)
function NewContributionDialog({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: () => void }) {
  const [contributorName, setContributorName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const url = await uploadReceipt(file, "loan-contributions");
    if (url) { setComprobanteUrl(url); toast.success("Comprobante adjuntado"); }
    setUploading(false);
  }

  async function handleSave() {
    const pesos = parseInt(amount.replace(/\D/g, ""), 10);
    if (!contributorName.trim() || !Number.isFinite(pesos) || pesos <= 0) {
      toast.error("Completa quién aportó y un monto válido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/loan-contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, contributorName: contributorName.trim(), amount: pesos * 100, contributionDate: date || null, comprobanteUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Aporte registrado");
      setContributorName(""); setAmount(""); setDate(""); setComprobanteUrl(null);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Nuevo aporte</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quién aportó</label>
            <Input placeholder="ej. SoloNacho" value={contributorName} onChange={(e) => setContributorName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Monto</label>
            <MoneyInput placeholder="$0" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Comprobante</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" id="contribution-file" onChange={handleFile} />
            <Button type="button" variant="outline" className="w-full justify-start gap-2 cursor-pointer" disabled={uploading} onClick={() => document.getElementById("contribution-file")?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {comprobanteUrl ? "Comprobante adjuntado" : "Subir comprobante"}
            </Button>
          </div>
          <Button className="w-full cursor-pointer" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar aporte"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoanCard({ loan, onChanged, onEdit }: { loan: Loan; onChanged: () => void; onEdit: (loan: Loan) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showRepayment, setShowRepayment] = useState(false);
  const pct = loan.principalAmount > 0 ? Math.min(100, Math.round((loan.repaidAmount / loan.principalAmount) * 100)) : 0;
  const hasBankDetails = loan.holderRut || loan.bankName || loan.accountType || loan.accountNumber || loan.contactEmail;

  async function toggleReceived() {
    const res = await fetch(`/api/loans/${loan.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: !loan.received }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar"); return; }
    onChanged();
  }

  async function deleteLoan() {
    if (!confirm(`¿Eliminar el préstamo de ${loan.lenderName}? Se borran también sus abonos.`)) return;
    const res = await fetch(`/api/loans/${loan.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("No se pudo eliminar"); return; }
    toast.success("Préstamo eliminado");
    onChanged();
  }

  async function deleteRepayment(repaymentId: string) {
    if (!confirm("¿Eliminar este abono?")) return;
    const res = await fetch(`/api/loans/${loan.id}/repayments/${repaymentId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("No se pudo eliminar"); return; }
    onChanged();
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button className="flex items-center gap-1.5 text-left cursor-pointer flex-1 min-w-0" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{loan.lenderName}</span>
          {loan.responsibleName && <Badge variant="secondary" className="text-xs shrink-0">Resp: {loan.responsibleName}</Badge>}
          {!loan.received && <Badge variant="outline" className="text-xs shrink-0">Pendiente de recibir</Badge>}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => setShowRepayment(true)}>
            <HandCoins className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Registrar abono</span>
          </Button>
          <button onClick={() => onEdit(loan)} className="text-muted-foreground hover:text-foreground p-1 cursor-pointer" title="Editar préstamo">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={deleteLoan} className="text-muted-foreground hover:text-destructive p-1 cursor-pointer" title="Eliminar préstamo">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs pl-5">
        <div><span className="text-muted-foreground">Prestado</span><p className="font-semibold">{formatCents(loan.principalAmount)}</p></div>
        <div><span className="text-muted-foreground">Devuelto</span><p className="font-semibold text-green-700 dark:text-green-400">{formatCents(loan.repaidAmount)}</p></div>
        <div><span className="text-muted-foreground">Saldo pendiente</span><p className="font-semibold text-red-700 dark:text-red-400">{formatCents(loan.outstandingAmount)}</p></div>
      </div>
      <div className="pl-5">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-green-600" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground pl-5 cursor-pointer">
        <Checkbox checked={loan.received} onCheckedChange={toggleReceived} />
        Ya se recibió esta plata
      </label>

      {expanded && (
        <div className="pl-5 space-y-2 border-t pt-2">
          {hasBankDetails && (
            <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5 bg-muted/40 rounded-md p-2">
              {loan.holderRut && <span>RUT: {loan.holderRut}</span>}
              {loan.bankName && <span>Banco: {loan.bankName}</span>}
              {loan.accountType && <span>{loan.accountType}</span>}
              {loan.accountNumber && <span>N° {loan.accountNumber}</span>}
              {loan.contactEmail && <span className="col-span-2">{loan.contactEmail}</span>}
            </div>
          )}
          {loan.repayments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin abonos registrados todavía.</p>
          ) : (
            loan.repayments.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span>{formatCents(r.amount)} {r.repaymentDate && `· ${format(new Date(`${r.repaymentDate}T00:00:00`), "d MMM yyyy", { locale: es })}`}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.comprobanteUrl && (
                    <SignedFileLink path={r.comprobanteUrl} className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                    </SignedFileLink>
                  )}
                  <button onClick={() => deleteRepayment(r.id)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <RepaymentDialog open={showRepayment} onClose={() => setShowRepayment(false)} loanId={loan.id} onCreated={onChanged} />
    </div>
  );
}

export default function LoansPage() {
  const { activeProject } = useProject();
  const projectId = activeProject?.id ?? null;
  const [loans, setLoans] = useState<Loan[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [showNewContribution, setShowNewContribution] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setLoans([]); setContributions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [loansRes, contribRes] = await Promise.all([
        fetch(`/api/loans?projectId=${projectId}`),
        fetch(`/api/loan-contributions?projectId=${projectId}`),
      ]);
      setLoans(loansRes.ok ? await loansRes.json() : []);
      setContributions(contribRes.ok ? await contribRes.json() : []);
    } catch {
      // se preservan datos previos si falla transitoriamente
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function deleteContribution(id: string) {
    if (!confirm("¿Eliminar este aporte?")) return;
    const res = await fetch(`/api/loan-contributions/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("No se pudo eliminar"); return; }
    toast.success("Aporte eliminado");
    void load();
  }

  const totalPrestado = loans.filter((l) => l.received).reduce((s, l) => s + l.principalAmount, 0);
  const totalPendienteRecibir = loans.filter((l) => !l.received).reduce((s, l) => s + l.principalAmount, 0);
  const totalDevuelto = loans.reduce((s, l) => s + l.repaidAmount, 0);
  const totalSaldoPendiente = loans.reduce((s, l) => s + l.outstandingAmount, 0);
  const totalAportes = contributions.reduce((s, c) => s + c.amount, 0);
  const fondoDisponible = totalAportes - totalDevuelto;

  if (!projectId) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm text-muted-foreground">
        Selecciona un proyecto arriba para ver sus préstamos.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Préstamos</h1>
        <p className="text-muted-foreground text-sm">
          Plata prestada por terceros para financiar el proyecto -- no es ingreso ni gasto real, es deuda.
          Proyecto: {activeProject?.name}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Prestado (recibido)</p>
          <p className="text-lg font-bold">{formatCents(totalPrestado)}</p>
          {totalPendienteRecibir > 0 && <p className="text-xs text-muted-foreground">+{formatCents(totalPendienteRecibir)} por recibir</p>}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Devuelto a prestamistas</p>
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCents(totalDevuelto)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Saldo pendiente</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{formatCents(totalSaldoPendiente)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Fondo disponible</p>
          <p className="text-lg font-bold">{formatCents(fondoDisponible)}</p>
          <p className="text-xs text-muted-foreground">Aportes − devuelto</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Prestamistas</h2>
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => { setEditingLoan(null); setShowLoanForm(true); }}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Nuevo préstamo</span>
              </Button>
            </div>
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin préstamos registrados todavía.</p>
            ) : (
              <div className="space-y-2">
                {loans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onChanged={load}
                    onEdit={(l) => { setEditingLoan(l); setShowLoanForm(true); }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Aportes mensuales (para pagarle a los prestamistas)</h2>
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => setShowNewContribution(true)}>
                <Plus className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Nuevo aporte</span>
              </Button>
            </div>
            {contributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin aportes registrados todavía.</p>
            ) : (
              <div className="rounded-lg border divide-y">
                {contributions.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{c.contributorName} <span className="text-muted-foreground font-normal">{formatCents(c.amount)}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {c.contributionDate ? format(new Date(`${c.contributionDate}T00:00:00`), "d MMM yyyy", { locale: es }) : format(new Date(c.createdAt), "d MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.comprobanteUrl && (
                        <SignedFileLink path={c.comprobanteUrl} className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </SignedFileLink>
                      )}
                      <button onClick={() => deleteContribution(c.id)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <LoanFormDialog
        open={showLoanForm}
        onClose={() => { setShowLoanForm(false); setEditingLoan(null); }}
        projectId={projectId}
        editingLoan={editingLoan}
        onSaved={load}
      />
      <NewContributionDialog open={showNewContribution} onClose={() => setShowNewContribution(false)} projectId={projectId} onCreated={load} />
    </div>
  );
}
