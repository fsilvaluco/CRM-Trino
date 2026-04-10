"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  SORTED_COUNTRIES,
  COUNTRY_PRESETS,
  DEFAULT_LOCALE,
  formatCurrencyWith,
  formatDateWith,
  type LocaleSettings,
} from "@/lib/locale";
import { useLocale } from "@/lib/locale-context";

export function LocaleSettingsPanel() {
  const { reload } = useLocale();
  const [form, setForm] = useState<LocaleSettings>(DEFAULT_LOCALE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // All IANA timezones available in the browser
  const allTimezones = useMemo<string[]>(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] })
        .supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings/locale")
      .then((r) => r.json())
      .then((data: LocaleSettings) => {
        setForm({ ...DEFAULT_LOCALE, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCountryChange = (country: string) => {
    const preset = COUNTRY_PRESETS[country];
    if (preset) setForm({ ...preset });
    else setForm((f) => ({ ...f, country }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Configuración regional guardada");
      reload();
    } catch {
      toast.error("Error guardando configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const previewAmount = formatCurrencyWith(125000, form); // $1,250
  const previewDate = formatDateWith(new Date(), form);

  return (
    <div className="space-y-5">
      {/* País */}
      <div className="space-y-1.5">
        <Label>País</Label>
        <Select value={form.country} onValueChange={(v) => handleCountryChange(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona tu país" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {SORTED_COUNTRIES.map((c) => (
              <SelectItem key={c.country} value={c.country}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Auto-completa moneda, zona horaria y prefijo telefónico.
        </p>
      </div>

      {/* Moneda */}
      <div className="space-y-1.5">
        <Label>Moneda</Label>
        <Select
          value={form.currency}
          onValueChange={(v) => setForm((f) => ({ ...f, currency: v ?? f.currency }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {/* Monedas comunes ordenadas */}
            {[
              { code: "ARS", label: "ARS — Peso argentino" },
              { code: "AUD", label: "AUD — Dólar australiano" },
              { code: "BOB", label: "BOB — Boliviano" },
              { code: "BRL", label: "BRL — Real brasileño" },
              { code: "CAD", label: "CAD — Dólar canadiense" },
              { code: "CHF", label: "CHF — Franco suizo" },
              { code: "CLP", label: "CLP — Peso chileno" },
              { code: "CNY", label: "CNY — Yuan chino" },
              { code: "COP", label: "COP — Peso colombiano" },
              { code: "CRC", label: "CRC — Colón costarricense" },
              { code: "CUP", label: "CUP — Peso cubano" },
              { code: "DOP", label: "DOP — Peso dominicano" },
              { code: "EUR", label: "EUR — Euro" },
              { code: "GBP", label: "GBP — Libra esterlina" },
              { code: "GTQ", label: "GTQ — Quetzal guatemalteco" },
              { code: "HNL", label: "HNL — Lempira hondureño" },
              { code: "INR", label: "INR — Rupia india" },
              { code: "JPY", label: "JPY — Yen japonés" },
              { code: "KRW", label: "KRW — Won coreano" },
              { code: "MAD", label: "MAD — Dírham marroquí" },
              { code: "MXN", label: "MXN — Peso mexicano" },
              { code: "NGN", label: "NGN — Naira nigeriana" },
              { code: "NIO", label: "NIO — Córdoba nicaragüense" },
              { code: "PEN", label: "PEN — Sol peruano" },
              { code: "PLN", label: "PLN — Esloti polaco" },
              { code: "PYG", label: "PYG — Guaraní paraguayo" },
              { code: "RUB", label: "RUB — Rublo ruso" },
              { code: "SGD", label: "SGD — Dólar de Singapur" },
              { code: "USD", label: "USD — Dólar estadounidense" },
              { code: "UYU", label: "UYU — Peso uruguayo" },
              { code: "VES", label: "VES — Bolívar venezolano" },
              { code: "ZAR", label: "ZAR — Rand sudafricano" },
            ].map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Zona horaria */}
      <div className="space-y-1.5">
        <Label>Zona horaria</Label>
        <Select
          value={form.timezone}
          onValueChange={(v) => setForm((f) => ({ ...f, timezone: v ?? f.timezone }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {allTimezones.length > 0
              ? allTimezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))
              : /* fallback si el browser no soporta supportedValuesOf */
                [
                  "America/Mexico_City", "America/Monterrey", "America/Tijuana", "America/Cancun",
                  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                  "America/Toronto", "America/Vancouver", "America/Bogota", "America/Lima",
                  "America/Santiago", "America/Argentina/Buenos_Aires", "America/Sao_Paulo",
                  "America/Caracas", "America/La_Paz", "America/Asuncion", "America/Montevideo",
                  "America/Guayaquil", "America/Guatemala", "America/Costa_Rica",
                  "America/El_Salvador", "America/Tegucigalpa", "America/Managua",
                  "America/Panama", "America/Santo_Domingo", "America/Puerto_Rico",
                  "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Berlin",
                  "Europe/Rome", "Europe/Lisbon", "Europe/Amsterdam", "Europe/Warsaw",
                  "Europe/Moscow", "Europe/Zurich", "Asia/Dubai", "Asia/Kolkata",
                  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore",
                  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Africa/Casablanca",
                  "Australia/Sydney", "Pacific/Auckland",
                ].map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prefijo telefónico */}
      <div className="space-y-1.5">
        <Label>Prefijo telefónico</Label>
        <Select
          value={form.phonePrefix}
          onValueChange={(v) => setForm((f) => ({ ...f, phonePrefix: v ?? f.phonePrefix }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {SORTED_COUNTRIES.map((c) => (
              <SelectItem key={`${c.country}-${c.phonePrefix}`} value={c.phonePrefix}>
                {c.phonePrefix} — {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="rounded-lg bg-muted/50 border p-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Vista previa
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Monto</span>
          <span className="font-semibold">{previewAmount}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Fecha de hoy</span>
          <span>{previewDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tel. ejemplo</span>
          <span>{form.phonePrefix} 55 1234 5678</span>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="w-full cursor-pointer">
        {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
        Guardar configuración regional
      </Button>
    </div>
  );
}
