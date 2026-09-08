"use client";

import { useEffect, useMemo, useState } from "react";
import { usePdfDocument } from "@/components/dossier/usePdfDocument";
import { PdfPageCanvas } from "@/components/dossier/PdfPageCanvas";
import { formatDossierValue, type DossierDataFormat } from "@/lib/dossier-data-sources";
import { GOOGLE_FONTS_HREF } from "@/lib/dossier-fonts";
import { CustomFontFaces } from "@/components/dossier/CustomFontFaces";
import { Loader2 } from "lucide-react";

const CANVAS_WIDTH = 800;

interface PublicField {
  id: string;
  pageNumber: number;
  xPct: number;
  yPct: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  textAlign: "left" | "center" | "right";
  value: number | null;
  format: DossierDataFormat;
}

interface PublicFont {
  name: string;
  url: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
}

interface PublicDossier {
  name: string;
  pdfUrl: string;
  pdfPageCount: number;
  fonts: PublicFont[];
  fields: PublicField[];
}

// Página pública del Dossier: renderiza cada página del PDF (pdf.js) y
// superpone los valores en vivo -- siempre el dato más actual de
// ArtistPro, sin login. Mismo patrón que /e/[id] (evento público).
export function DossierPublicClient({ id }: { id: string }) {
  const [data, setData] = useState<PublicDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/dossiers/${id}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setData(await res.json());
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const { pdf, numPages } = usePdfDocument(data?.pdfUrl ?? null);
  const pages = useMemo(() => Array.from({ length: numPages || data?.pdfPageCount || 0 }, (_, i) => i + 1), [numPages, data?.pdfPageCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Dossier no encontrado.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 flex flex-col items-center gap-6">
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <CustomFontFaces fonts={data.fonts} />
      <h1 className="text-lg font-semibold text-slate-800">{data.name}</h1>
      {pdf ? (
        pages.map((pageNumber) => (
          <div key={pageNumber} className="relative">
            <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} targetWidth={CANVAS_WIDTH} />
            <div className="absolute inset-0">
              {data.fields
                .filter((f) => f.pageNumber === pageNumber)
                .map((f) => {
                  const translateX = f.textAlign === "center" ? "-50%" : f.textAlign === "right" ? "-100%" : "0%";
                  return (
                    <div
                      key={f.id}
                      style={{
                        position: "absolute",
                        left: `${f.xPct}%`,
                        top: `${f.yPct}%`,
                        transform: `translate(${translateX}, -50%)`,
                        fontFamily: `"${f.fontFamily}", sans-serif`,
                        fontSize: `${f.fontSize}px`,
                        fontWeight: f.bold ? 700 : 400,
                        color: f.color,
                        textAlign: f.textAlign,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDossierValue(f.value, f.format)}
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      ) : (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
