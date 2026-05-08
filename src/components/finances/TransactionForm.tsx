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
import { Upload, Loader2, File, X, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProject } from "@/lib/project-context";

const EXPENSE_CATEGORIES = [
  "Transporte", "Alimentación", "Equipamiento", "Producción",
  "Marketing", "Servicios", "Arriendo", "Otro",
];
const INCOME_CATEGORIES = ["Venta", "Patrocinio", "Subsidio", "Transferencia", "Otro"];

// Helper para obtener URL pública del archivo (bucket debe ser público)
const getFilePublicUrl = (filePath: string): string => {
  const { data } = supabase.storage.from("finances").getPublicUrl(filePath);
  return data.publicUrl;
};

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Ingresa un monto"),
  description: z.string().min(1, "Agrega una descripción"),
  category: z.string().min(1, "Selecciona una categoría"),
  transactionDate: z.string().optional(),
  responsibleExternal: z.string().optional(), // Nombre de otra persona si el gasto lo pagó alguien más
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
  fileUrl: string | null;
  fileName: string | null;
}

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: InitialTransaction; // Si existe, estamos en modo edit
}

export function TransactionForm({ open, onClose, onCreated, initialData }: TransactionFormProps) {
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

      // Si el responsable no es un usuario registrado (es externo), cargar el nombre
      if (initialData.responsibleName && !initialData.responsibleUserId) {
        setValue("responsibleExternal", initialData.responsibleName);
      } else {
        setValue("responsibleExternal", "");
      }

      // No se necesita cargar URL, getPublicUrl es síncrono
    }
  }, [initialData, open, setValue]);

  const watchedType = watch("type");
  const watchedExternal = watch("responsibleExternal");
  const watchedReimbursed = watch("reimbursed");
  const categories = watchedType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

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
        
        // Timeout de 15s para evitar colgar infinitamente
        const uploadPromise = supabase.storage
          .from("finances")
          .upload(storagePath, file, { upsert: false });
        
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout subiendo archivo (15s). Intenta de nuevo.")), 15000)
        );
        
        const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<typeof uploadPromise>;

        if (uploadError) {
          toast.error("Error subiendo comprobante: " + uploadError.message);
          return;
        }
        fileUrl = storagePath;
        fileName = file.name;
      }

      // Responsable del gasto: siempre el usuario que lo ingresa
      // Si especifica otro nombre, ese va como responsibleName
      let responsibleUserId: string | null = user?.id || null;
      let responsibleName: string | null = null;

      if (data.responsibleExternal && data.responsibleExternal.trim() !== "") {
        // Si especificó otra persona, usar ese nombre
        responsibleName = data.responsibleExternal.trim();
      } else if (user) {
        // Si no, usar el nombre del usuario logueado
        responsibleName = user.user_metadata?.full_name || user.email || null;
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
              <Label>¿Lo pagó otra persona?</Label>
              <Input
                {...register("responsibleExternal")}
                placeholder="Dejar vacío si lo pagaste tú (opcional)"
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Por defecto quedas tú como quien ingresó el gasto. Si lo pagó otra persona, escribe su nombre aquí.
              </p>
            </div>
          )}

          {/* Reembolsado */}
          {watchedType === "expense" && watchedExternal && watchedExternal.trim() !== "" && (
            <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 bg-muted/30">
              <Checkbox
                id="reimbursed"
                checked={watchedReimbursed === true}
                onCheckedChange={(checked) => setValue("reimbursed", checked === true)}
                className="cursor-pointer"
              />
              <label htmlFor="reimbursed" className="text-sm cursor-pointer select-none">
                Pagado / Reembolsado — el dinero ya fue devuelto a {watchedExternal}
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
                <label className="flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground/60" />
                  <span className="text-sm text-muted-foreground text-center">
                    Arrastra un archivo o haz clic para subir<br />
                    <span className="text-xs">PDF, JPG, PNG — máx. 10 MB</span>
                  </span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
                </label>
              )}
            </div>
          )}

          {/* Comprobante existente - solo en modo edit */}
          {isEditMode && initialData.fileUrl && (
            <div className="space-y-1.5">
              <Label>Comprobante adjunto</Label>
              <a
                href={getFilePublicUrl(initialData.fileUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
              >
                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{initialData.fileName || "Ver comprobante"}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </a>
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
