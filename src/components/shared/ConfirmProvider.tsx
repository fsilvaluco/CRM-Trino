"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  /** Pregunta principal, p. ej. `¿Eliminar "Show Teatro Caupolicán"?` */
  title: string;
  /** Consecuencias de la accion. Opcional pero recomendado. */
  description?: string;
  /** Verbo concreto: "Eliminar contacto", "Desconectar". Default: "Eliminar". */
  confirmLabel?: string;
  /** Default: "Cancelar". */
  cancelLabel?: string;
  /** Pinta el boton de confirmar en rojo. Default: true. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Reemplazo accesible de window.confirm. Uso:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "¿Eliminar?", confirmLabel: "Eliminar" }))) return;
 *
 * Devuelve true solo si el usuario presiona el boton de confirmar; cerrar
 * con Esc, clic afuera o "Cancelar" devuelve false.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // Si habia una confirmacion pendiente, se resuelve como cancelada.
    resolverRef.current?.(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-5 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg outline-none duration-100 sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex gap-3">
              {destructive && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                <AlertDialog.Title className="font-heading text-base font-semibold leading-snug">
                  {options?.title}
                </AlertDialog.Title>
                {options?.description && (
                  <AlertDialog.Description className="text-sm text-muted-foreground whitespace-pre-line">
                    {options.description}
                  </AlertDialog.Description>
                )}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Close
                render={<Button variant="outline" className="cursor-pointer" />}
              >
                {options?.cancelLabel ?? "Cancelar"}
              </AlertDialog.Close>
              <Button
                className={cn(
                  "cursor-pointer",
                  destructive &&
                    "bg-red-700 text-white hover:bg-red-800 dark:bg-red-400 dark:text-slate-950 dark:hover:bg-red-300"
                )}
                onClick={() => settle(true)}
              >
                {options?.confirmLabel ?? "Eliminar"}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
