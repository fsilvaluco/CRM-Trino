"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Trash2, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { DOSSIER_DATA_SOURCES } from "@/lib/dossier-data-sources";
import type { EditableDossierField } from "./DossierFieldOverlay";

interface DossierFieldPanelProps {
  field: EditableDossierField;
  /** Google Fonts + tipografías propias del proyecto, ya combinadas. */
  fonts: string[];
  onChange: (patch: Partial<EditableDossierField>) => void;
  onDelete: () => void;
}

const GROUPS = Array.from(new Set(DOSSIER_DATA_SOURCES.map((d) => d.group)));

const ALIGN_OPTIONS: { value: EditableDossierField["textAlign"]; icon: typeof AlignLeft }[] = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

export function DossierFieldPanel({ field, fonts, onChange, onDelete }: DossierFieldPanelProps) {
  const currentSource = DOSSIER_DATA_SOURCES.find((d) => d.key === field.dataSource);

  return (
    <div className="space-y-4 p-3 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Campo seleccionado</p>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground hover:text-destructive cursor-pointer" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Dato</Label>
        <Select value={field.dataSource} onValueChange={(v) => v && onChange({ dataSource: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Elige un dato">{currentSource?.label ?? "Elige un dato"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((group) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {DOSSIER_DATA_SOURCES.filter((d) => d.group === group).map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipografía</Label>
          <Select value={field.fontFamily} onValueChange={(v) => v && onChange({ fontFamily: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue>{field.fontFamily}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {fonts.map((f) => (
                <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tamaño</Label>
          <Input
            type="number"
            min={8}
            max={200}
            className="h-8 text-xs"
            value={field.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) || field.fontSize })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Color</Label>
          <input
            type="color"
            className="h-8 w-full rounded-md border cursor-pointer"
            value={field.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs h-8 cursor-pointer">
          <Checkbox checked={field.bold} onCheckedChange={(v) => onChange({ bold: Boolean(v) })} />
          Negrita
        </label>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Alineación</Label>
        <div className="flex items-center gap-1">
          {ALIGN_OPTIONS.map(({ value, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={field.textAlign === value ? "default" : "outline"}
              className="h-8 w-8 p-0 cursor-pointer"
              onClick={() => onChange({ textAlign: value })}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
