"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

interface ProfileEditSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileEditSheet({ open, onClose }: ProfileEditSheetProps) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(
    user?.user_metadata?.full_name ?? ""
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.user_metadata?.avatar_url ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (fullName || user?.email || "U")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validaciones
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Añadir timestamp para forzar recarga
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);
      toast.success("Foto actualizada");
    } catch {
      toast.error("Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Actualizar auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl },
      });
      if (authError) throw authError;

      // Actualizar tabla profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName, avatar_url: avatarUrl })
        .eq("id", user.id);
      if (profileError) throw profileError;

      toast.success("Perfil guardado");
      onClose();
    } catch {
      toast.error("Error al guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Mi perfil</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 rounded-full bg-primary text-primary-foreground p-1.5 shadow hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG o GIF · Máx. 2MB
            </p>
          </div>

          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="full-name">Nombre completo</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>

          {/* Email (solo lectura) */}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">
              El email no se puede cambiar desde aquí.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
