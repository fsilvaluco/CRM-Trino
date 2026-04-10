"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { applyTheme } from "@/components/layout/ThemeInitializer";

const BUSINESS_TYPES = [
  { value: "services", label: "Servicios" },
  { value: "products", label: "Productos" },
  { value: "saas", label: "SaaS" },
  { value: "agency", label: "Agencia" },
  { value: "consulting", label: "Consultoría" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "freelance", label: "Freelance" },
  { value: "other", label: "Otro" },
];

const INDUSTRIES = [
  { value: "general", label: "General" },
  { value: "technology", label: "Tecnología" },
  { value: "finance", label: "Finanzas" },
  { value: "health", label: "Salud" },
  { value: "real_estate", label: "Inmobiliaria" },
  { value: "education", label: "Educación" },
  { value: "retail", label: "Retail" },
  { value: "food", label: "Alimentos y Bebidas" },
  { value: "marketing", label: "Marketing" },
  { value: "legal", label: "Legal" },
  { value: "logistics", label: "Logística" },
  { value: "construction", label: "Construcción" },
  { value: "other", label: "Otro" },
];

const TEAM_SIZES = [
  { value: "solo", label: "Solo" },
  { value: "2-5", label: "2 – 5 personas" },
  { value: "6-15", label: "6 – 15 personas" },
  { value: "16-50", label: "16 – 50 personas" },
  { value: "50+", label: "Más de 50" },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

const THEMES = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "auto", label: "Automático (sistema)" },
];

interface BusinessSettings {
  business: { type: string; industry: string; teamSize: string };
  preferences: { language: "es" | "en"; theme: "light" | "dark" | "auto" };
}

export function BusinessSettingsPanel() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/business")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      applyTheme(settings.preferences.theme);
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const setBusiness = (key: keyof BusinessSettings["business"], value: string) => {
    setSettings((prev) =>
      prev ? { ...prev, business: { ...prev.business, [key]: value } } : prev
    );
  };

  const setPref = (key: keyof BusinessSettings["preferences"], value: string) => {
    setSettings((prev) =>
      prev ? { ...prev, preferences: { ...prev.preferences, [key]: value } } : prev
    );
  };

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de negocio</Label>
        <Select value={settings.business.type} onValueChange={(v) => setBusiness("type", v ?? "")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Industria</Label>
        <Select value={settings.business.industry} onValueChange={(v) => setBusiness("industry", v ?? "")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((i) => (
              <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tamaño del equipo</Label>
        <Select value={settings.business.teamSize} onValueChange={(v) => setBusiness("teamSize", v ?? "")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_SIZES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Idioma</Label>
        <Select value={settings.preferences.language} onValueChange={(v) => setPref("language", v ?? "")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Tema</Label>
        <Select value={settings.preferences.theme} onValueChange={(v) => setPref("theme", v ?? "")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}
