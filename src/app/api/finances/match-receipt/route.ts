import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractReceiptFromImage, extractReceiptFromText, isOpenAIEnabled, type ReceiptExtraction } from "@/lib/openai";
import { extractTextFromPdf } from "@/lib/pdf-text";

const MAX_BASE64_LENGTH = 12_000_000;

interface Candidate {
  id: string;
  description: string | null;
  category: string | null;
  amount: number;
  transactionDate: string | null;
  score: number;
}

// Similaridad de texto muy simple (no hace falta una librería para esto):
// cuenta cuántas palabras de 3+ letras del comprobante aparecen en la
// descripción/categoría del gasto del presupuesto.
function textScore(needle: string | null, haystacks: (string | null)[]): number {
  if (!needle) return 0;
  const words = needle
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // sin tildes
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return 0;

  const haystack = haystacks
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits / words.length;
}

// Cercanía de monto: 1 si es exacto, decae mientras más lejos, 0 si
// difiere en más de 30%.
function amountScore(extracted: number | null, candidate: number): number {
  if (extracted === null || extracted <= 0) return 0;
  const diff = Math.abs(extracted - candidate) / Math.max(extracted, candidate);
  if (diff > 0.3) return 0;
  return 1 - diff / 0.3;
}

function rankCandidates(
  extraction: ReceiptExtraction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Candidate[] {
  return rows
    .map((row) => {
      const amt = amountScore(extraction.amount, row.amount);
      const txt = textScore(extraction.vendor, [row.description, row.category]) * 0.6
        + textScore(extraction.description, [row.description, row.category]) * 0.4;
      // El monto pesa más -- es la señal más confiable en un comprobante.
      const score = amt * 0.7 + txt * 0.3;
      return {
        id: row.id,
        description: row.description,
        category: row.category,
        amount: row.amount,
        transactionDate: row.transaction_date,
        score,
      };
    })
    .filter((c) => c.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// POST /api/finances/match-receipt -- { mode: "image"|"pdf", projectId, ... }
// Lee un comprobante con IA y busca gastos del presupuesto (sin comprobante
// aún) que podrían corresponder a ese pago, para poder adjuntarlo con un
// clic en vez de crear una transacción nueva a mano.
export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  if (!isOpenAIEnabled()) {
    return NextResponse.json({ error: "Lectura con IA no disponible (falta configurar OPENAI_API_KEY)" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { mode, imageBase64, mediaType, pdfBase64, projectId } = body as {
    mode?: "image" | "pdf";
    imageBase64?: string;
    mediaType?: string;
    pdfBase64?: string;
    projectId?: string;
  };

  let extraction: ReceiptExtraction;
  try {
    if (mode === "image") {
      if (!imageBase64) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
      if (imageBase64.length > MAX_BASE64_LENGTH) {
        return NextResponse.json({ error: "La imagen es muy grande" }, { status: 413 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      const type = allowedTypes.includes(mediaType ?? "") ? (mediaType as "image/jpeg" | "image/png" | "image/webp") : "image/jpeg";
      extraction = await extractReceiptFromImage(imageBase64, type);
    } else if (mode === "pdf") {
      if (!pdfBase64) return NextResponse.json({ error: "Falta el PDF" }, { status: 400 });
      if (pdfBase64.length > MAX_BASE64_LENGTH) {
        return NextResponse.json({ error: "El PDF es muy grande" }, { status: 413 });
      }
      let pdfText: string;
      try {
        pdfText = await extractTextFromPdf(pdfBase64);
      } catch (err) {
        console.error("[match-receipt] fallo leyendo el PDF", err);
        return NextResponse.json({ error: "No se pudo leer el PDF -- ingresa el gasto a mano." }, { status: 422 });
      }
      if (!pdfText.trim()) {
        return NextResponse.json({ error: "El PDF no tiene texto extraíble -- ingresa el gasto a mano." }, { status: 422 });
      }
      extraction = await extractReceiptFromText(pdfText);
    } else {
      return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
    }
  } catch (err) {
    console.error("[match-receipt] extracción falló", err);
    return NextResponse.json({ error: "No se pudo leer el comprobante -- ingresa el gasto a mano." }, { status: 502 });
  }

  // Candidatos: gastos del proyecto que todavía no tienen comprobante
  // adjunto. No filtramos por "reimbursed" -- ese campo es para
  // devoluciones internas, no para si el proveedor ya tiene comprobante.
  let candidates: Candidate[] = [];
  if (projectId) {
    const { data, error: dbError } = await supabase
      .from("transactions")
      .select("id, description, category, amount, transaction_date")
      .eq("organization_id", orgId!)
      .eq("project_id", projectId)
      .eq("type", "expense")
      .is("deleted_at", null)
      .is("file_path", null);
    if (!dbError && data) {
      candidates = rankCandidates(extraction, data);
    }
  }

  return NextResponse.json({ extraction, candidates });
}
