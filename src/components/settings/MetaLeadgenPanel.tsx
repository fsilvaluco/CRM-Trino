"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Copy } from "lucide-react";
import { useProject } from "@/lib/project-context";

// Meta Lead Ads (formularios instantaneos de Facebook/Instagram) del
// proyecto activo. Los leads llegan por /api/leads/meta-webhook y entran al
// CRM igual que los del formulario web. El token de la pagina y el App
// Secret se pegan aqui y quedan solo en el servidor: esta pantalla nunca los
// recibe de vuelta, solo sabe si existen.

interface Status {
  supported: boolean;
  productName: string | null;
  pageId: string | null;
  pageName: string | null;
  hasPageToken: boolean;
  hasAppSecret: boolean;
  verifyToken: string | null;
  callbackUrl: string;
  lastLeadAt: string | null;
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="cursor-pointer shrink-0"
          aria-label={`Copiar ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copiado");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function MetaLeadgenPanel() {
  const { activeProject, isAllProjects } = useProject();
  const [status, setStatus] = useState<Status | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);

  // Depende solo del id del proyecto: el contexto se refresca en segundo plano y
  // no debe borrar lo que el usuario esta escribiendo.
  const projectId = activeProject?.id;
  const load = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/integrations/meta-leadgen?projectId=${projectId}`);
    if (!res.ok) return setStatus(null);
    const data: Status = await res.json();
    setStatus(data);
    setPageId((cur) => cur || (data.pageId ?? ""));
    setPageName((cur) => cur || (data.pageName ?? ""));
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isAllProjects || !activeProject) {
    return <p className="text-sm text-muted-foreground">Selecciona un proyecto para configurar Meta Lead Ads.</p>;
  }
  if (status && !status.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        {activeProject.name} no tiene un formulario conectado a Meta Lead Ads.
      </p>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/meta-leadgen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProject!.id,
          pageId,
          pageName,
          pageAccessToken: pageToken || undefined,
          appSecret: appSecret || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setPageToken("");
      setAppSecret("");
      toast.success("Meta Lead Ads guardado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const ready = status?.pageId && status.hasPageToken && status.hasAppSecret;
  const missing = [
    !status?.pageId && "ID de la página",
    !status?.hasAppSecret && "App Secret",
    !status?.hasPageToken && "token de la página",
  ].filter(Boolean);

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {ready ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <CircleAlert className="h-4 w-4 text-amber-600" />
        )}
        <span>
          {ready
            ? `Activo: los leads de la página ${status!.pageName || status!.pageId} entran como ${status!.productName}.` +
              (status!.lastLeadAt
                ? ` Último lead: ${new Date(status!.lastLeadAt).toLocaleString("es-CL")}.`
                : " Aún no llega ningún lead.")
            : `Falta: ${missing.join(", ")}.`}
        </span>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Crea (o usa) una app de Meta en developers.facebook.com, de tipo Empresa, con el producto Webhooks.</li>
        <li>
          Pega abajo el App Secret (Configuración de la app → Básica) y un token de acceso de la página SiSoy con el
          permiso <code>leads_retrieval</code> (idealmente de un usuario del sistema del Business Manager, que no vence).
        </li>
        <li>
          En Webhooks de la app, elige el objeto <strong>Page</strong>, pega la URL de devolución y el verify token de
          abajo, verifica y suscribe el campo <code>leadgen</code>.
        </li>
        <li>
          Suscribe la página a la app (Graph API: <code>POST /{"{page-id}"}/subscribed_apps?subscribed_fields=leadgen</code>{" "}
          con el token de la página) y prueba con la herramienta de pruebas de anuncios para clientes potenciales.
        </li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="leadgen-page">ID de la página de Facebook</Label>
          <Input id="leadgen-page" value={pageId} onChange={(e) => setPageId(e.target.value)} inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leadgen-name">Nombre de la página (opcional)</Label>
          <Input id="leadgen-name" value={pageName} onChange={(e) => setPageName(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="leadgen-secret">App Secret de la app de Meta</Label>
          <Input
            id="leadgen-secret"
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={status?.hasAppSecret ? "Guardado. Déjalo vacío para mantenerlo" : "Pega el App Secret aquí"}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="leadgen-token">Token de acceso de la página (leads_retrieval)</Label>
          <Input
            id="leadgen-token"
            type="password"
            autoComplete="off"
            value={pageToken}
            onChange={(e) => setPageToken(e.target.value)}
            placeholder={status?.hasPageToken ? "Guardado. Déjalo vacío para mantenerlo" : "Pega el token aquí"}
          />
        </div>
        {status && <CopyField id="leadgen-url" label="URL de devolución (callback)" value={status.callbackUrl} />}
        {status?.verifyToken ? (
          <CopyField id="leadgen-verify" label="Verify token" value={status.verifyToken} />
        ) : (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            El verify token se genera al guardar por primera vez.
          </p>
        )}
      </div>

      <Button type="submit" disabled={saving || !pageId} className="cursor-pointer">
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
