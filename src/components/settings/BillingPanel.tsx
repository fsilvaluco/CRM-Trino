"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Payment {
  id: string;
  subject: string;
  amount: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  paid: { label: "Pagado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
  expired: { label: "Expirado", variant: "secondary" },
};

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function BillingPanel() {
  const [subject, setSubject] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);

  const loadPayments = () => {
    fetch("/api/billing/payments")
      .then((r) => r.json())
      .then((d) => setPayments(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadPayments();
  }, []);

  async function handleCreatePayment() {
    if (!subject || !amount || !email) {
      toast.error("Completa descripción, monto y email");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, amount: Number(amount), email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear el cobro");
        return;
      }
      window.open(data.paymentUrl, "_blank");
      setSubject("");
      setAmount("");
      setEmail("");
      setTimeout(loadPayments, 2000);
    } catch {
      toast.error("Error de red al crear el cobro");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm text-muted-foreground mb-3">
          Genera un cobro de prueba en <span className="font-medium">sandbox de Flow</span> — no es dinero real
          hasta que se configuren las credenciales de producción. Usa la tarjeta de prueba{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">4051 8856 0044 6623</code>, cualquier fecha, CVV{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">123</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Descripción</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Plan Business - julio" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monto (CLP)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" type="number" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email del pagador</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" type="email" />
          </div>
        </div>
        <Button onClick={handleCreatePayment} disabled={creating} className="mt-3 cursor-pointer">
          {creating ? "Creando..." : "Generar link de pago"}
        </Button>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Historial de cobros</p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros todavía.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => {
              const statusInfo = STATUS_LABELS[p.status] ?? { label: p.status, variant: "secondary" as const };
              return (
                <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{p.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("es-CL")}
                      {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{CLP.format(p.amount)}</span>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
