"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CheckCircle2, FileWarning, Download, Lock, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ExternalSignatureView } from "@/types/external-signature";
import { DocumentoCierre } from "@/components/events/DocumentoCierre";

// Las pantallas de la firma externa que NO son el formulario: link roto,
// link vencido/anulado, y la constancia de una firma ya registrada.
// Separadas de FirmaExternaClient para que ese archivo quede solo con el
// flujo de firmar (regla de ~300 líneas por componente del CLAUDE.md).

export function formatDateTime(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="mx-auto w-full max-w-lg space-y-4">
        {children}
        <p className="pb-4 text-center text-[11px] text-muted-foreground">Artist Pro · artistpro.app</p>
      </div>
    </div>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

export function EstadoError({ title, hint }: { title: string; hint?: string }) {
  return (
    <Shell>
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <FileWarning className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{hint ?? "Pídele al equipo que te mande uno nuevo."}</p>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function EstadoCerrado({ status }: { status: "vencido" | "revocado" | "invalidado" }) {
  if (status === "invalidado") {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <RotateCcw className="h-8 w-8 mx-auto text-orange-600" />
            <p className="font-medium">El cierre cambió después de tu firma</p>
            <p className="text-sm text-muted-foreground">
              Tu firma anterior quedó registrada y te queda como respaldo, pero el equipo reabrió el cierre y los
              números pueden ser otros. Te van a mandar un link nuevo para que revises y firmes la versión final.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">{status === "vencido" ? "Este link venció" : "Este link fue anulado"}</p>
          <p className="text-sm text-muted-foreground">Pídele al equipo que te mande uno nuevo.</p>
        </CardContent>
      </Card>
    </Shell>
  );
}

/** Constancia de lo que se firmó: los datos del firmante, la evidencia que
 * respalda la firma, el PDF y el documento completo. */
export function EstadoFirmado({
  data,
  token,
}: {
  data: ExternalSignatureView & { signature: NonNullable<ExternalSignatureView["signature"]> };
  token: string;
}) {
  const s = data.signature;

  return (
    <Shell>
      <Card>
        <CardContent className="py-8 text-center space-y-1">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
          <p className="text-lg font-semibold">Conformidad firmada</p>
          <p className="text-sm text-muted-foreground">
            {s.name} · {formatDateTime(s.signedAt)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Constancia de la firma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          <Evidence label="Nombre" value={s.name} />
          <Evidence label="RUT / identificación" value={s.rut} />
          <Evidence label="Correo verificado" value={s.email} />
          <Evidence label="Teléfono" value={s.phone} />
          <Evidence label="Fecha y hora" value={formatDateTime(s.signedAt)} />
          {s.ipAddress && <Evidence label="IP" value={s.ipAddress} />}
          <Evidence label="Huella del documento" value={s.documentHash.slice(0, 32) + "…"} />
          {!s.documentUnchanged && (
            <p className="pt-2 text-amber-600">
              Atención: el cierre de caja cambió después de tu firma. Tu comprobante conserva la versión que firmaste.
            </p>
          )}
          <a
            href={`/api/public/firma/${token}/comprobante`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3 w-full cursor-pointer`}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Descargar comprobante en PDF
          </a>
        </CardContent>
      </Card>

      {data.document && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Documento firmado</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentoCierre doc={data.document} />
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
