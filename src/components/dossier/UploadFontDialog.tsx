"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FontFormat } from "@/types/analytics";

interface UploadFontDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onUploaded: () => void;
}

const FORMAT_BY_EXT: Record<string, FontFormat> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
  otf: "opentype",
};

// Subir una tipografía propia del proyecto (ej. "New Spirit") para usarla
// en los campos del Dossier junto a las de Google Fonts -- cada proyecto
// tiene las suyas.
export function UploadFontDialog({ open, onOpenChange, projectId, onUploaded }: UploadFontDialogProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    if (f && !name.trim()) {
      setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Elige un archivo de tipografía (.woff2, .woff, .ttf, .otf)");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const format = FORMAT_BY_EXT[ext];
    if (!format) {
      toast.error("Formato no soportado -- usa .woff2, .woff, .ttf o .otf");
      return;
    }
    if (!name.trim()) {
      toast.error("Ponle un nombre a la tipografía");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede superar 10 MB");
      return;
    }
    setUploading(true);
    try {
      const storagePath = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const uploadResult = await supabase.storage.from("fonts").upload(storagePath, file, { upsert: false });
      if (uploadResult.error) {
        toast.error("Error subiendo el archivo: " + uploadResult.error.message);
        return;
      }
      const res = await fetch("/api/project-fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: name.trim(), filePath: storagePath, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la tipografía");
        return;
      }
      toast.success(`"${name.trim()}" agregada -- ya aparece en el selector de tipografía`);
      setName("");
      setFile(null);
      onUploaded();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo subir la tipografía");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Subir tipografía del proyecto</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Sube el archivo de una fuente propia (ej. una tipografía de marca) para poder elegirla en los campos del
            Dossier de este proyecto. Formatos: .woff2, .woff, .ttf, .otf.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="font-file">Archivo</Label>
            <input
              ref={fileInputRef}
              id="font-file"
              type="file"
              accept=".woff2,.woff,.ttf,.otf"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" className="w-full justify-start cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-2" />
              {file ? file.name : "Elegir archivo..."}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="font-name">Nombre</Label>
            <Input id="font-name" placeholder="ej. New Spirit" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={uploading} className="cursor-pointer">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subir"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
