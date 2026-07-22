"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";

const socialSchema = z.object({
  platform: z.enum(["instagram", "tiktok", "youtube"], {
    error: "Selecciona una plataforma",
  }),
  followers: z.string().min(1, "Ingresa la cantidad de seguidores"),
  recorded_at: z.string().min(1, "La fecha es requerida"),
});

type SocialFormData = z.infer<typeof socialSchema>;

interface RegisterSnapshotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
  /** Si se pasa, la plataforma queda fija (no seleccionable) — usado en los
   * tabs de Instagram/TikTok/YouTube para no tener que elegirla cada vez. */
  lockedPlatform?: "instagram" | "tiktok" | "youtube";
}

export function RegisterSnapshotSheet({
  open,
  onOpenChange,
  onRegistered,
  lockedPlatform,
}: RegisterSnapshotSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState<"instagram" | "tiktok" | "youtube" | "">(
    lockedPlatform ?? ""
  );
  const { activeProject } = useProject();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SocialFormData>({ resolver: zodResolver(socialSchema) });

  useEffect(() => {
    if (lockedPlatform) {
      setPlatform(lockedPlatform);
      setValue("platform", lockedPlatform);
    }
  }, [lockedPlatform, setValue]);

  const onSubmit = async (data: SocialFormData) => {
    setSubmitting(true);
    try {
      if (!activeProject?.id) {
        toast.error("Selecciona un proyecto antes de registrar");
        return;
      }
      const body = {
        projectId: activeProject.id,
        platform: data.platform,
        followers: parseInt(data.followers, 10),
        recordedAt: data.recorded_at,
      };
      const res = await fetch("/api/analytics/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Error al registrar snapshot");
        return;
      }
      toast.success("Snapshot registrado");
      reset();
      setPlatform(lockedPlatform ?? "");
      onOpenChange(false);
      onRegistered();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Registrar snapshot de redes</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <Label>Plataforma *</Label>
            {lockedPlatform ? (
              <Input value={lockedPlatform} disabled className="capitalize" />
            ) : (
              <Select
                value={platform}
                onValueChange={(v) => {
                  const val = v as "instagram" | "tiktok" | "youtube";
                  setPlatform(val);
                  setValue("platform", val);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                </SelectContent>
              </Select>
            )}
            {errors.platform && (
              <p className="text-xs text-destructive">{errors.platform.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="followers">Seguidores *</Label>
            <Input
              id="followers"
              type="number"
              min="0"
              placeholder="10000"
              {...register("followers")}
            />
            {errors.followers && (
              <p className="text-xs text-destructive">{errors.followers.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recorded_at">Fecha del registro *</Label>
            <Input id="recorded_at" type="date" {...register("recorded_at")} />
            {errors.recorded_at && (
              <p className="text-xs text-destructive">{errors.recorded_at.message}</p>
            )}
          </div>
          <SheetFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar snapshot
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
