"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Loader2, File, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProject } from "@/lib/project-context";

const EXPENSE_CATEGORIES = [
  "Transporte", "Alimentación", "Equipamiento", "Producción",
  "Marketing", "Servicios", "Arriendo", "Otro",
];
const INCOME_CATEGORIES = ["Venta", "Patrocinio", "Subsidio", "Transferencia", "Otro"];

const EXTERNAL_KEY = "__external__";
const NONE_KEY = "__none__";

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Ingresa un monto"),
  description: z.string().min(1, "Agrega una descripción"),
  category: z.string().min(1, "Selecciona una categoría"),
  transactionDate: z.string().optional(),
  // internal member key OR EXTERNAL_KEY OR NONE_KEY
  responsibleKey: z.string().optional(),
  responsibleExternal: z.string().optional(),
  reimbursed: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface InitialTransaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  category: string | null;
  transactionDate: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  reimbursed: boolean;
}

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Array<{ user_id: string; name: string }>;
  initialData?: InitialTransaction; // Si existe, estamos en modo edit
}

export function TransactionForm({ open, onClose, onCreated, members, initialData }: TransactionFormProps) {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const isEditMode = !!initialData;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "expense",
      amount: "",
      description: "",
      category: "",
      transactionDate: "",
      responsibleKey: NONE_KEY,
      responsibleExternal: "",
      reimbursed: false,
    },
  });

  // Pre-cargar formulario cuando hay initialData
  useEffect(() => {
    if (initialData && open) {
      setValue("type", initialData.type);
      setValue("amount", initialData.amount.toString());
      setValue("description", initialData.description ?? "");
      setValue("category", initialData.category ?? "");
      setValue("transactionDate", initialData.transactionDate ?? "");
      setValue("reimbursed", initialData.reimbursed);

      // Determinar responsibleKey
      if (initialData.responsibleUserId) {
        // Usuario miembro del proyecto
        setValue("responsibleKey", initialData.responsibleUserId);
        setValue("responsibleExternal", "");
      } else if (initialData.responsibleName) {
        // Usuario externo
        setValue("responsibleKey", EXTERNAL_KEY);
        setValue("responsibleExternal", initialData.responsibleName);
      } else {
        // Sin asignar
        setValue("responsibleKey", NONE_KEY);
        setValue("responsibleExternal", "");
      }
    }
  }, [initialData, open, setValue]);

  const watchedType = watch("type");
  const watchedKey = watch("responsibleKey");
  const watchedReimbursed = watch("reimbursed");
  const categories = watchedType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const isExternal = watchedKey === EXTERNAL_KEY;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("El archivo no puede superar 10 MB"); return; }
    setFile(f);
  };

  const onSubmit = async (data: FormData) => {
    setUploading(true);
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    try {
      // Upload file solo en modo create (no edit)
      if (file && user && !isEditMode) {
        const ext = file.name.split(".").pop();
        const storagePath = `receipts/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("finances")
          .upload(storagePath, file, { upsert: false });

        if (uploadError) {
          toast.error("Error subiendo comprobante: " + uploadError.message);
          return;
        }
        fileUrl = storagePath;
        fileName = file.name;
      }

      // Resolve responsible name and user_id
      let responsibleUserId: string | null = null;
      let responsibleName: string | null = null;

      if (data.responsibleKey && data.responsibleKey !== NONE_KEY) {
        if (data.responsibleKey === EXTERNAL_KEY) {
          responsibleName = data.responsibleExternal?.trim() || null;
          responsibleUserId = null;
        } else {
          const member = members.find((m) => m.user_id === data.responsibleKey);
          responsibleUserId = data.responsibleKey;
          responsibleName = member?.name ?? null;
        }
      }

      const amount = Math.round(parseFloat(data.amount.replace(/\./g, "").replace(",", ".")));

      if (isEditMode) {
        // Modo edit: PUT
        const res = await fetch(`/api/finances/${initialData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: data.type,
            amount,
            description: data.description,
            category: data.category,
            transactionDate: data.transactionDate || null,
            responsibleUserId,
            responsibleName,
            reimbursed: data.reimbursed === true,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Error al guardar");
        }

        toast.success("Transacción actualizada");
      } else {
        // Modo create: POST
        const res = await fetch("/api/finances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: data.type,
            amount,
            description: data.description,
            category: data.category,
            responsibleName,
            responsibleUserId,
            reimbursed: data.reimbursed === true,
            transactionDate: data.transactionDate || null,
            filePath: fileUrl,
            fileName,
            projectId: activeProject?.id ?? null,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Error al guardar");
        }

        toast.success(data.type === "expense" ? "Gasto registrado" : "Ingreso registrado");
        reset();
        setFile(null);
      }

      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Editar Transacción" : "Nuevo Comprobante"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setValue("type", t); setValue("category", ""); }}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                  watchedType === t
                    ? t === "expense"
                      ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                      : "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {t === "expense" ? "Gasto" : "Ingreso"}
              </button>
            ))}
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label>Monto (CLP)</Label>
            <Input {...register("amount")} placeholder="ej. 50000" inputMode="numeric" />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          {/* Fecha del gasto */}
          <div className="space-y-1.5">
            <Label>Fecha del gasto</Label>
            <Input type="date" {...register("transactionDate")} />
            <p className="text-xs text-muted-foreground">Cuándo ocurrió realmente el gasto (puede diferir de hoy)</p>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label>Descripción *</Label>
            <Textarea {...register("description")} placeholder="¿En qué se gastó / de dónde vino?" rows={2} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label>Categoría *</Label>
            <Select value={watch("category")} onValueChange={(v) => v && setValue("category", v)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
          </div>

          {/* Responsable (solo para gastos) */}
          {watchedType === "expense" && (
            <div className="space-y-1.5">
              <Label>Encargado del gasto</Label>
              <Select
                value={watchedKey ?? NONE_KEY}
                onValueChange={(v) => {
                  setValue("responsibleKey", v || NONE_KEY);
                  if (v !== EXTERNAL_KEY) setValue("responsibleExternal", "");
                }}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="¿Quién pagó?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_KEY}>Sin asignar</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                  <SelectItem value={EXTERNAL_KEY}>Encargado externo…</SelectItem>
                </SelectContent>
              </Select>
              {isExternal && (
                <Input
                  {...register("responsibleExternal")}
                  placeholder="Nombre del encargado externo"
                  className="mt-1.5"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Persona que realizó el gasto y podría recibir devolución
              </p>
            </div>
          )}

          {/* Reembolsado */}
          {watchedType === "expense" && watchedKey && watchedKey !== NONE_KEY && (
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 bg-muted/30">
              <Checkbox
                id="reimbursed"
                checked={watchedReimbursed === true}
                onCheckedChange={(checked) => setValue("reimbursed", checked === true)}
                className="cursor-pointer"
              />
              <label htmlFor="reimbursed" className="text-sm cursor-pointer select-none">
                Pagado / Reembolsado — el dinero ya fue devuelto al encargado
              </label>
            </div>
          )}

          {/* Comprobante (archivo) - solo en modo create */}
          {!isEditMode && (
            <div className="space-y-1.5">
              <Label>Comprobante (opcional)</Label>
              {file ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 truncate">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground text-center">
                    Arrastra un archivo o haz clic para subir<br />
                    <span className="text-xs">PDF, JPG, PNG — máx. 10 MB</span>
                  </span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || uploading} className="cursor-pointer">
              {isSubmitting || uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isSubmitting || uploading ? "Guardando..." : isEditMode ? "Actualizar" : "Guardar Comprobante"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
