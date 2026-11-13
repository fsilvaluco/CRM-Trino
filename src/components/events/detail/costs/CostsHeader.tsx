"use client";

import { useRef } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Wallet, Loader2, Lock, LockOpen, Printer, Upload, Share2, Mail, Sparkles,
  Download, FileSpreadsheet, FileDown,
} from "lucide-react";
import type { EventDetail, PrintSection, SignatureData } from "../types";
import { formatDateTime } from "../utils";
import type { CostsSectionState } from "../hooks/useCostsSection";
import type { CostClosingState } from "../hooks/useCostClosing";

// Encabezado de la Planilla de costos: título con estado de cierre/firmas y
// la barra de acciones (guardar, adjuntar, descargar, importar, imprimir,
// links, cerrar/reabrir caja, mandar acta).
export function CostsHeader({
  id,
  event,
  costs,
  closing,
  signatureData,
  costSheetClosed,
  canEditCosts,
  printSection,
}: {
  id: string;
  event: EventDetail;
  costs: CostsSectionState;
  closing: CostClosingState;
  signatureData: SignatureData | null;
  costSheetClosed: boolean;
  canEditCosts: boolean;
  printSection: (section: PrintSection) => void;
}) {
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  return (
    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
      <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
        <Wallet className="h-4 w-4 shrink-0" />
        Planilla de costos
        {costSheetClosed && (
          <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 ml-1">
            <Lock className="h-3 w-3 mr-1" />
            Cerrada
          </Badge>
        )}
        {/* Solo con la caja cerrada: antes de eso no hay nada que
            aprobar todavía (los firmantes ya se pueden elegir, pero
            un "0/3 pendiente" ahí arriba sería engañoso). */}
        {signatureData?.costSheetClosed && (
          <Badge
            variant="secondary"
            className={`text-xs ml-1 ${signatureData.allSigned ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
          >
            {signatureData.allSigned
              ? "Aprobado por todos"
              : `Pendiente de aprobación (${signatureData.requiredSigners.filter((r) => signatureData.signatures.some((s) => s.userId === r.userId)).length}/${signatureData.requiredSigners.length})`}
          </Badge>
        )}
      </CardTitle>
      <div className="flex items-center gap-2 no-print flex-wrap">
        {canEditCosts && costs.dirty && (
          <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={costs.saving} onClick={costs.save}>
            {costs.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar costos"}
          </Button>
        )}
        {canEditCosts && !costSheetClosed && (
          <>
            <input
              ref={attachmentFileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void costs.handleAddFromFile(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              disabled={costs.addingFromFile}
              onClick={() => attachmentFileInputRef.current?.click()}
              title="Adjuntar boleta/factura y crear el ítem de costo automáticamente con IA"
            >
              {costs.addingFromFile ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Sparkles className="h-3.5 w-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{costs.addingFromFile ? "Leyendo..." : "Adjuntar costo"}</span>
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" title="Descargar la planilla" />
            }
          >
            <Download className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Descargar</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => closing.download("pdf")}
            >
              <FileDown className="h-3.5 w-3.5 mr-2" />
              PDF para aprobación
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => closing.download("csv")}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
              CSV para copiar a otro evento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canEditCosts && !costSheetClosed && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            onClick={() => costs.setImportOpen(true)}
            title="Copiar los costos de otro evento o subir un CSV"
          >
            <Upload className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Importar</span>
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("costs")} title="Imprimir">
          <Printer className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Imprimir</span>
        </Button>
        {canEditCosts && !costSheetClosed && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer no-print"
            onClick={async () => {
              const url = `${window.location.origin}/eventos/${id}/gastos`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado -- solo lo pueden abrir los integrantes de este proyecto (con su cuenta)");
              } catch {
                toast.info(url);
              }
            }}
            title="Copiar link para que reporten sus gastos"
          >
            <Share2 className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Link para gastos</span>
          </Button>
        )}
        {canEditCosts && (costSheetClosed ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              onClick={async () => {
                const url = `${window.location.origin}/eventos/${id}/firmar`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copiado -- solo lo pueden abrir los integrantes de este proyecto (con su cuenta)");
                } catch {
                  toast.info(url);
                }
              }}
              title="Copiar link para que el equipo apruebe el cierre"
            >
              <Share2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Link de firma</span>
            </Button>
            {signatureData?.allSigned && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs cursor-pointer"
                disabled={closing.informing}
                onClick={closing.inform}
                title={event.costSheetInformedAt ? `Acta enviada el ${formatDateTime(event.costSheetInformedAt)} -- click para reenviarla` : "Mandar el acta (resumen + PDF con todas las firmas) a todos los que firmaron. Sale sola cuando firman todos."}
              >
                {closing.informing ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Mail className="h-3.5 w-3.5 sm:mr-1" />}
                <span className="hidden sm:inline">{event.costSheetInformedAt ? "Reenviar acta" : "Mandar acta"}</span>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closing.closing} onClick={closing.reopen} title="Reabrir">
              <LockOpen className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Reabrir</span>
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closing.closing} onClick={closing.close} title="Cerrar caja">
            <Lock className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Cerrar caja</span>
          </Button>
        ))}
      </div>
    </CardHeader>
  );
}
