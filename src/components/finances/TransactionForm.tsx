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
import { Upload, Loader2, File, X, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useProject } from "@/lib/project-context";
import { SignedFileLink } from "@/components/finances/SignedFileLink";

const EXPENSE_CATEGORIES = [
  "Transporte", "Alimentación", "Equipamiento", "Producción",
  "Marketing", "Servicios", "Arriendo",
  // Producción musical (masters/singles/LP) -- agregadas 19 ago 2026 para
  // presupuestos de grabación/lanzamiento, ej. "LP Los Últimos Románticos".
  "Masterización", "Mezcla", "Grabación", "Prensa/PR", "Video", "Fotografía", "Campaña ADS",
  "Pago de préstamo",
  "Otro",
];
const INCOME_CATEGORIES = ["Venta", "Patrocinio", "Subsidio", "Transferencia", "Préstamo", "Otro"];

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.string().min(1, "Ingresa un monto"),
  description: z.string().min(1, "Agrega una glosa o comentario"),
  emisor: z.string().optional(),
  receptor: z.string().optional(),
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
  emisor: string | null;
  receptor: string | null;
  category: string | null;
  transactionDate: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  reimbursed: boolean;
  filePath: string | null;
  fileUrl: string | null;
  fileName: string | null;
}

// Convierte un File a base64 puro (sin el prefijo data:...;base64,) --
// mismo helper que AttachReceiptDialog, para mandarlo a
// /api/finances/match-receipt y leer el comprobante con IA.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [analyzing, setAnalyzing] = useState(false);

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
      emisor: "",
      receptor: "",
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
      setValue("emisor", initialData.emisor ?? "");
      setValue("receptor", initialData.receptor ?? "");
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("El archivo no puede superar 10 MB"); return; }
    setFile(f);
    await analyzeWithAI(f);
  };

  // Lee el comprobante con IA y autocompleta el formulario -- mismo
  // extractor que ya usa "Adjuntar comprobante (IA)" (ver
  // /api/finances/match-receipt), solo que acá se ignoran los candidatos
  // (esto crea un comprobante nuevo, no busca uno existente para pegarle
  // el archivo). Nunca falla el flujo si la IA no está disponible o no
  // logra leer algo -- solo no autocompleta, se sigue a mano.
  const analyzeWithAI = async (f: File) => {
    setAnalyzing(true);
    try {
      const isPdf = f.type === "application/pdf";
      const base64 = await fileToBase64(f);
      const res = await fetch("/api/finances/match-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isPdf
            ? { mode: "pdf", pdfBase64: base64 }
            : { mode: "image", imageBase64: base64, mediaType: f.type || "image/jpeg" }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return; // sin IA configurada, o falló la lectura -- se sigue a mano
      const extraction = body.extraction as {
        amount: number | null; vendor: string | null; payer: string | null; date: string | null; description: string | null;
      } | undefined;
      if (!extraction) return;

      if (extraction.amount) setValue("amount", String(extraction.amount));
      if (extraction.date) setValue("transactionDate", extraction.date);
      if (extraction.payer) setValue("emisor", extraction.payer);
      if (extraction.vendor) setValue("receptor", extraction.vendor);
      if (extraction.description) setValue("description", extraction.description);
      if (extraction.amount || extraction.date || extraction.payer || extraction.vendor || extraction.description) {
        toast.success("Comprobante leído -- revisa los datos antes de guardar");
      }
    } catch {
      // silencioso -- la lectura con IA es un extra, no un requisito
    } finally {
      setAnalyzing(false);
    }
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
        
        console.log("[Upload] Iniciando upload...");
        console.log("[Upload] user.id:", user.id);
        console.log("[Upload] storagePath:", storagePath);
        console.log("[Upload] file size:", file.size, "type:", file.type);
        
        // Verificar sesión activa
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("[Upload] session:", sessionData.session ? "✅ Activa" : "❌ NO HAY SESIÓN");
        
        const uploadResult = await supabase.storage
          .from("finances")
          .upload(storagePath, file, { upsert: false });
        
        console.log("[Upload] resultado:", uploadResult);
        
        if (uploadResult.error) {
          console.error("[Upload] ERROR:", uploadResult.error);
          toast.error("Error subiendo comprobante: " + uploadResult.error.message);
          return;
        }
        console.log("[Upload] ✅ Éxito:", uploadResult.data);
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
            emisor: data.emisor || null,
            receptor: data.receptor || null,
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
            emisor: data.emisor || null,
            receptor: data.receptor || null,
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

          {/* Emisor / Receptor -- separado de la glosa libre, se pueden
              llenar a mano o autocompletar leyendo el comprobante con IA
              (ver Comprobante más abajo). */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Emisor</Label>
              <Input {...register("emisor")} placeholder="Quién envió/pagó" />
            </div>
            <div className="space-y-1.5">
              <Label>Receptor</Label>
              <Input {...register("receptor")} placeholder="Quién recibió" />
            </div>
          </div>

          {/* Glosa / comentario */}
          <div className="space-y-1.5">
            <Label>Glosa o comentario *</Label>
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
                  {analyzing ? <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" /> : <File className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="text-sm flex-1 truncate">{file.name}</span>
                  {!analyzing && (
                    <button type="button" onClick={() => setFile(null)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  )}
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
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {analyzing ? "Leyendo el comprobante con IA..." : "Al subirlo intentamos completar monto, fecha, emisor, receptor y glosa -- siempre revisa antes de guardar."}
              </p>
            </div>
          )}

          {/* Comprobante existente - solo en modo edit */}
          {isEditMode && initialData.filePath && (
            <div className="space-y-1.5">
              <Label>Comprobante adjunto</Label>
              <SignedFileLink
                path={initialData.filePath}
                className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
              >
                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{initialData.fileName || "Ver comprobante"}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </SignedFileLink>
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
