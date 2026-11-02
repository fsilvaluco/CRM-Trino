"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { useConfirm } from "@/components/shared/ConfirmProvider";

export function DealDetailActions({ dealId, dealTitle }: { dealId: string; dealTitle: string }) {
  const confirm = useConfirm();
  const { isAdmin } = useProject();
  const router = useRouter();

  if (!isAdmin) return null;

  async function handleDelete() {
    if (
      !(await confirm({
        title: `¿Eliminar "${dealTitle}"?`,
        description: "Esta acción no se puede deshacer.",
        confirmLabel: "Eliminar deal",
        destructive: true,
      }))
    )
      return;
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo eliminar el deal");
        return;
      }
      toast.success("Deal eliminado");
      router.push("/deals");
    } catch {
      toast.error("Error al eliminar el deal");
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="cursor-pointer text-destructive hover:text-destructive"
      onClick={handleDelete}
    >
      <Trash2 className="h-4 w-4 mr-1" />
      Eliminar
    </Button>
  );
}
