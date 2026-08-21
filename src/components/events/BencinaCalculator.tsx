"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

const QUICK_RATES = [200, 250];

interface BencinaCalculatorProps {
  km: number | null;
  kmRate: number | null;
  disabled?: boolean;
  // Sube el patch completo -- el llamador decide qué hacer con
  // amountCents (normalmente: pisar el monto del ítem, siempre editable
  // después a mano si el cálculo no calza exacto).
  onChange: (patch: { km: number | null; kmRate: number | null; amountCents: number | null }) => void;
}

// Categoría "Bencina": en vez de calcular el gasto a mano, se sube una
// captura de una app de mapas con los km del trayecto, se elige un factor
// $/km (los dos valores más comunes, $200 o $250, quedan de acceso
// rápido, pero se puede escribir cualquier otro), y se calcula el monto
// solo -- siempre editable después en el campo de monto normal.
export function BencinaCalculator({ km, kmRate, disabled, onChange }: BencinaCalculatorProps) {
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function emit(nextKm: number | null, nextRate: number | null) {
    const amountCents = nextKm != null && nextRate != null ? Math.round(nextKm * nextRate * 100) : null;
    onChange({ km: nextKm, kmRate: nextRate, amountCents });
  }

  async function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen no puede superar 10 MB");
      return;
    }

    setReading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/eventos/km-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo leer la captura");
        return;
      }
      if (typeof data.km === "number" && data.km > 0) {
        emit(data.km, kmRate ?? QUICK_RATES[0]);
        toast.success(`${data.km} km leídos -- revisa antes de guardar`);
      } else {
        toast.error("No se pudo leer la distancia de esa captura -- ingrésala a mano");
      }
    } catch {
      toast.error("No se pudo leer la captura");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="w-full space-y-1.5 rounded-md border border-dashed p-2 bg-muted/20">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          disabled={disabled || reading}
          onChange={handleScreenshot}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 cursor-pointer"
          disabled={disabled || reading}
          onClick={() => fileInputRef.current?.click()}
        >
          {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          Captura de Maps
        </Button>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Km"
            value={km ?? ""}
            disabled={disabled}
            onChange={(e) => emit(e.target.value ? Number(e.target.value) : null, kmRate)}
            className="h-7 text-xs w-16"
          />
          <span className="text-xs text-muted-foreground">km ×</span>
        </div>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="$/km"
            value={kmRate ?? ""}
            disabled={disabled}
            onChange={(e) => emit(km, e.target.value ? Number(e.target.value) : null)}
            className="h-7 text-xs w-20"
          />
          {QUICK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              disabled={disabled}
              onClick={() => emit(km, rate)}
              className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer shrink-0 ${
                kmRate === rate ? "border-primary text-primary bg-primary/10" : "border-input text-muted-foreground hover:bg-muted"
              }`}
            >
              ${rate}
            </button>
          ))}
        </div>
      </div>
      {km != null && kmRate != null && (
        <p className="text-xs text-muted-foreground">
          {km} km × ${kmRate.toLocaleString("es-CL")} = <span className="font-medium text-foreground">${Math.round(km * kmRate).toLocaleString("es-CL")}</span>
        </p>
      )}
    </div>
  );
}
