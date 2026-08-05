"use client";

import { Input } from "@/components/ui/input";

function formatPesos(digits: string): string {
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return "$" + n.toLocaleString("es-CL");
}

// Input de plata que muestra $40.000 mientras se escribe "40000", corriendo
// el separador de miles solo, en vez de mostrar el número pelado. El valor
// que entra/sale por value/onChange son siempre los dígitos en pesos (sin
// signo ni puntos) -- la conversión a centavos (convención de toda la app)
// sigue haciéndola quien use este input, igual que antes.
export function MoneyInput({
  value,
  onChange,
  placeholder = "$0",
  className,
  disabled,
  id,
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder={placeholder}
      value={formatPesos(value)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      className={className}
      disabled={disabled}
    />
  );
}
