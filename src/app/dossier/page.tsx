"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileText, ExternalLink, Trash2, Pencil, Music2, SquarePlay, Type } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { supabase } from "@/lib/supabase";
import { ManualStatsDialog } from "@/components/dossier/ManualStatsDialog";
import { UploadFontDialog } from "@/components/dossier/UploadFontDialog";
import { CustomFontFaces } from "@/components/dossier/CustomFontFaces";
import { Badge } from "@/components/ui/badge";
import type { Dossier, ProjectFont } from "@/types/analytics";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// pdf.js solo se usa para contar páginas al subir -- carga dinámica, mismo
// motivo que en usePdfDocument (no existe en SSR). El worker se sirve
// desde /public/pdf.worker.min.mjs -- ver el comentario en
// usePdfDocument.ts sobre por qué no se resuelve con import.meta.url.
async function countPdfPages(file: File): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = doc.numPages;
  doc.destroy();
  return pages;
}

export default function DossierListPage() {
  const { activeProject } = useProject();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [manualStatsPlatform, setManualStatsPlatform] = useState<"tiktok" | "youtube" | null>(null);
  const [uploadFontOpen, setUploadFontOpen] = useState(false);
  const [fonts, setFonts] = useState<ProjectFont[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFonts = useCallback(async () => {
    if (!activeProject?.id) {
      setFonts([]);
      return;
    }
    try {
      const res = await fetch(`/api/project-fonts?projectId=${activeProject.id}`);
      if (res.ok) setFonts(await res.json());
    } catch {
      // silencioso -- no bloquea el resto de la página
    }
  }, [activeProject?.id]);

  useEffect(() => {
    loadFonts();
  }, [loadFonts]);

  const handleDeleteFont = async (id: string) => {
    if (!confirm("¿Eliminar esta tipografía? Los campos del Dossier que la usan van a dejar de verse con ella.")) return;
    try {
      const res = await fetch(`/api/project-fonts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Tipografía eliminada");
      loadFonts();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const load = useCallback(async () => {
    if (!activeProject?.id) {
      setDossiers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/dossiers?projectId=${activeProject.id}`);
      const data = await res.json();
      setDossiers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar los dossiers");
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (file: File) => {
    if (!activeProject?.id) {
      toast.error("Selecciona un proyecto primero");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Solo se admiten archivos PDF");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("El PDF no puede superar 50 MB");
      return;
    }
    setUploading(true);
    try {
      const pageCount = await countPdfPages(file);
      const storagePath = `${activeProject.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const uploadResult = await supabase.storage.from("dossiers").upload(storagePath, file, { upsert: false });
      if (uploadResult.error) {
        toast.error("Error subiendo el archivo: " + uploadResult.error.message);
        return;
      }
      const name = file.name.replace(/\.pdf$/i, "");
      const res = await fetch("/api/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, name, pdfPath: storagePath, pdfPageCount: pageCount }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      toast.success("Dossier creado -- ahora posiciona los datos");
      load();
      window.location.href = `/dossier/${created.id}`;
    } catch {
      toast.error("No se pudo crear el dossier");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este dossier? Se pierde el PDF y las posiciones guardadas.")) return;
    try {
      const res = await fetch(`/api/dossiers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Dossier eliminado");
      load();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  if (!activeProject) {
    return <p className="text-sm text-muted-foreground p-4">Selecciona un proyecto para ver sus dossiers.</p>;
  }

  return (
    <div className="space-y-4">
      <CustomFontFaces fonts={fonts} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Dossier</h1>
          <p className="text-sm text-muted-foreground">
            Sube el PDF del dossier (diseñado en Canva u otra herramienta, sin los números) y posiciona los datos
            que se van a rellenar solos con la info de ArtistPro.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setManualStatsPlatform("tiktok")}>
            <Music2 className="h-3.5 w-3.5 mr-1.5" /> Registrar TikTok
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setManualStatsPlatform("youtube")}>
            <SquarePlay className="h-3.5 w-3.5 mr-1.5" /> Registrar YouTube
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setUploadFontOpen(true)}>
            <Type className="h-3.5 w-3.5 mr-1.5" /> Subir tipografía
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" className="cursor-pointer" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {uploading ? "Subiendo..." : "Subir PDF"}
          </Button>
        </div>
      </div>

      {fonts.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-muted-foreground">Tipografías del proyecto:</span>
          {fonts.map((f) => (
            <Badge key={f.id} variant="outline" className="gap-1 pr-1">
              <span style={{ fontFamily: `"${f.name}"` }}>{f.name}</span>
              <button
                onClick={() => handleDeleteFont(f.id)}
                className="text-muted-foreground hover:text-destructive cursor-pointer"
                title="Eliminar tipografía"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : dossiers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin dossiers todavía. Sube el PDF para empezar a posicionar datos en vivo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dossiers.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {d.pdfPageCount} página{d.pdfPageCount !== 1 ? "s" : ""} · actualizado{" "}
                  {format(new Date(d.updatedAt), "d MMM yyyy", { locale: es })}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/dossier/${d.id}`}>
                    <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer">
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                  </Link>
                  <a href={`/d/${d.id}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Link público
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs cursor-pointer text-muted-foreground hover:text-destructive ml-auto"
                    onClick={() => handleDelete(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {manualStatsPlatform && (
        <ManualStatsDialog
          open={Boolean(manualStatsPlatform)}
          onOpenChange={(open) => !open && setManualStatsPlatform(null)}
          platform={manualStatsPlatform}
          onSaved={() => {}}
        />
      )}

      <UploadFontDialog
        open={uploadFontOpen}
        onOpenChange={setUploadFontOpen}
        projectId={activeProject.id}
        onUploaded={loadFonts}
      />
    </div>
  );
}
