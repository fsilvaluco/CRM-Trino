"use client";

import { use, useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, CheckCircle2, Music2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Show {
  id: string;
  venue: string;
  city: string;
  date: string;
}

interface RatingForm {
  musician_name: string;
  vibe: number;
  audience_sang: boolean;
  monitor_quality: number;
  notes: string;
}

export default function RatePage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = use(params);

  const [show, setShow] = useState<Show | null>(null);
  const [loadingShow, setLoadingShow] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState<RatingForm>({
    musician_name: "",
    vibe: 5,
    audience_sang: false,
    monitor_quality: 3,
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchShow() {
      const { data, error: fetchError } = await supabase
        .from("shows")
        .select("id, venue, city, date")
        .eq("id", showId)
        .single();

      if (fetchError || !data) {
        setNotFound(true);
      } else {
        setShow(data as Show);
      }
      setLoadingShow(false);
    }

    fetchShow();
  }, [showId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.musician_name.trim()) return;

    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from("show_ratings").insert({
      show_id: showId,
      musician_name: form.musician_name.trim(),
      vibe: form.vibe,
      audience_sang: form.audience_sang,
      monitor_quality: form.monitor_quality,
      notes: form.notes.trim() || null,
    });

    if (insertError) {
      setError("Error al enviar. Por favor intenta de nuevo.");
    } else {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  if (loadingShow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <p className="text-gray-500 dark:text-gray-400 text-center text-lg">
          Show no encontrado
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            ¡Gracias por tu feedback!
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Tu valoración fue registrada correctamente.
          </p>
        </div>
      </div>
    );
  }

  const formattedDate = show
    ? format(new Date(show.date), "d 'de' MMMM yyyy", { locale: es })
    : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-start justify-center p-6 pt-10">
      <div className="w-full max-w-[480px]">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
            <Music2 className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {show?.venue}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {show?.city} · {formattedDate}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Musician name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="musician_name">Tu nombre</Label>
              <Input
                id="musician_name"
                placeholder="Tu nombre"
                value={form.musician_name}
                onChange={(e) =>
                  setForm({ ...form, musician_name: e.target.value })
                }
                required
              />
            </div>

            {/* Vibe slider */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="vibe">Vibe general</Label>
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {form.vibe}
                </span>
              </div>
              <input
                id="vibe"
                type="range"
                min={1}
                max={10}
                step={1}
                value={form.vibe}
                onChange={(e) =>
                  setForm({ ...form, vibe: Number(e.target.value) })
                }
                className="w-full h-2 rounded-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Audience sang toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="audience_sang">¿El público cantó?</Label>
              <button
                type="button"
                id="audience_sang"
                role="switch"
                aria-checked={form.audience_sang}
                onClick={() =>
                  setForm({ ...form, audience_sang: !form.audience_sang })
                }
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                  form.audience_sang
                    ? "bg-indigo-600"
                    : "bg-gray-200 dark:bg-gray-700",
                ].join(" ")}
              >
                <span
                  className={[
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
                    form.audience_sang ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>

            {/* Monitor quality slider */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="monitor_quality">Calidad de monitoreo</Label>
                <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {form.monitor_quality}
                </span>
              </div>
              <input
                id="monitor_quality"
                type="range"
                min={1}
                max={5}
                step={1}
                value={form.monitor_quality}
                onChange={(e) =>
                  setForm({ ...form, monitor_quality: Number(e.target.value) })
                }
                className="w-full h-2 rounded-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1</span>
                <span>5</span>
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Notas opcionales..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={submitting || !form.musician_name.trim()}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {submitting ? "Enviando..." : "Enviar valoración"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
