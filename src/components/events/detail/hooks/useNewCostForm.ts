"use client";

import { useState } from "react";
import type { CostItem } from "@/types/shows";
import { liquidoToBruto } from "@/lib/bhe";
import { newId } from "../utils";

// Campos del formulario "agregar ítem" de la Planilla de costos.
export function useNewCostForm() {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [responsable, setResponsable] = useState("");
  const [responsableContactId, setResponsableContactId] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState("");
  const [esBhe, setEsBhe] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [kmRate, setKmRate] = useState<number | null>(null);

  function buildItem(position: number): CostItem {
    const pesos = parseInt(amount.replace(/\D/g, ""), 10);
    const cents = Number.isFinite(pesos) ? pesos * 100 : 0;
    return {
      id: `tmp-${newId()}`,
      position,
      label: label.trim(),
      category,
      amount: esBhe ? liquidoToBruto(cents) : cents,
      liquidoAmount: esBhe ? cents : null,
      esBhe,
      responsable: responsable || null,
      responsableContactId,
      comprobanteUrl: comprobante || null,
      pagado: false,
      comprobantePagoUrl: null,
      notes: null,
      km,
      kmRate,
    };
  }

  function reset() {
    setLabel("");
    setCategory(null);
    setAmount("");
    setResponsable("");
    setResponsableContactId(null);
    setComprobante("");
    setEsBhe(false);
    setKm(null);
    setKmRate(null);
  }

  return {
    label, setLabel, category, setCategory, amount, setAmount,
    responsable, setResponsable, setResponsableContactId,
    comprobante, setComprobante, esBhe, setEsBhe,
    km, setKm, kmRate, setKmRate,
    buildItem, reset,
  };
}

export type NewCostFormState = ReturnType<typeof useNewCostForm>;
