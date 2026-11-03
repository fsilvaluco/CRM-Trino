import { toast } from "sonner";

interface DeleteWithUndoOptions {
  /** Texto del toast, p. ej. `Tarea "Mandar rider" eliminada`. */
  message: string;
  /** Quita el elemento de la UI de inmediato (actualizacion optimista). */
  hide: () => void;
  /** Vuelve a mostrar el elemento (al deshacer o si el borrado falla). */
  restore: () => void;
  /** Borra de verdad en el servidor. Debe lanzar si falla. */
  commit: () => Promise<void>;
  /** Mensaje si commit falla. */
  errorMessage?: string;
  /** Milisegundos antes de borrar de verdad. Default 6000. */
  duration?: number;
}

/**
 * Borrado diferido con "Deshacer": oculta el elemento, muestra un toast y
 * solo llama a la API cuando el toast se cierra sin que el usuario deshaga.
 *
 * Si la pestaña se cierra antes de que venza el plazo, el borrado se intenta
 * igual al salir (pagehide); si el navegador corta esa peticion, el elemento
 * simplemente no se borra, que es la falla segura.
 */
export function deleteWithUndo({
  message,
  hide,
  restore,
  commit,
  errorMessage = "No se pudo eliminar. Inténtalo de nuevo.",
  duration = 6000,
}: DeleteWithUndoOptions) {
  let settled = false;

  const run = async () => {
    if (settled) return;
    settled = true;
    window.removeEventListener("pagehide", run);
    try {
      await commit();
    } catch {
      restore();
      toast.error(errorMessage);
    }
  };

  hide();
  window.addEventListener("pagehide", run);

  toast(message, {
    duration,
    action: {
      label: "Deshacer",
      onClick: () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("pagehide", run);
        restore();
      },
    },
    onAutoClose: () => void run(),
    onDismiss: () => void run(),
  });
}
