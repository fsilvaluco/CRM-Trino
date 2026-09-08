"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { DOSSIER_DATA_SOURCE_MAP, formatDossierValue } from "@/lib/dossier-data-sources";

export interface EditableDossierField {
  localId: string;
  id?: string;
  pageNumber: number;
  xPct: number;
  yPct: number;
  dataSource: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  textAlign: "left" | "center" | "right";
}

interface DossierFieldOverlayProps {
  field: EditableDossierField;
  selected: boolean;
  previewValue: number | null | undefined;
  onSelect: () => void;
  onDragStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

// Overlay posicionado en % sobre el canvas del PDF -- muestra el valor
// actual (previsualización) con la tipografía/color/tamaño configurados.
// Clic = seleccionar (abre el panel de edición); arrastrar = reposicionar.
export function DossierFieldOverlay({ field, selected, previewValue, onSelect, onDragStart }: DossierFieldOverlayProps) {
  const source = DOSSIER_DATA_SOURCE_MAP.get(field.dataSource);
  const text = formatDossierValue(previewValue ?? null, source?.format ?? "number");

  const translateX = field.textAlign === "center" ? "-50%" : field.textAlign === "right" ? "-100%" : "0%";

  const style: CSSProperties = {
    position: "absolute",
    left: `${field.xPct}%`,
    top: `${field.yPct}%`,
    transform: `translate(${translateX}, -50%)`,
    fontFamily: `"${field.fontFamily}", sans-serif`,
    fontSize: `${field.fontSize}px`,
    fontWeight: field.bold ? 700 : 400,
    color: field.color,
    textAlign: field.textAlign,
    whiteSpace: "nowrap",
    cursor: "grab",
    userSelect: "none",
    lineHeight: 1.1,
    padding: "2px 4px",
    borderRadius: 4,
    outline: selected ? "2px dashed #3b82f6" : "1px dashed transparent",
    outlineOffset: 2,
  };

  return (
    <div
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        onDragStart(e);
      }}
      // El "click" que sigue a un pointerdown/pointerup es un evento
      // DISTINTO -- detener la propagación del pointerdown no alcanza para
      // frenarlo. Sin esto, soltar el clic sobre un dato existente también
      // dispara el onClick del contenedor (que agrega un dato NUEVO en esa
      // posición) -- se veía como que el dato "se duplicaba" al tocarlo, y
      // de paso hacía parecer que "borrar no funciona" (quedaban varios
      // duplicados apilados en el mismo lugar).
      onClick={(e) => e.stopPropagation()}
      title={source?.label ?? field.dataSource}
    >
      {text}
    </div>
  );
}
