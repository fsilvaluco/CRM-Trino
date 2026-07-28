"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Link2, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function SocialLinkField({
  projectId,
  platform,
  connected,
  derivedUrl,
}: {
  projectId?: string;
  platform: "instagram" | "facebook" | "spotify" | "tiktok" | "youtube";
  connected: boolean;
  derivedUrl?: string | null;
}) {
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connected || !projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => setManualUrl(data.socialLinks?.[platform] ?? null))
      .catch(() => {});
  }, [connected, projectId, platform]);

  if (connected && derivedUrl) {
    return (
      <a
        href={derivedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
        title="Abrir perfil real"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  }

  if (connected) return null;

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialLinks: { [platform]: draft.trim() || null } }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar el link");
        return;
      }
      setManualUrl(draft.trim() || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://instagram.com/..."
          className="h-6 text-xs w-48"
          autoFocus
        />
        <button onClick={handleSave} disabled={saving} className="cursor-pointer text-muted-foreground hover:text-primary">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="cursor-pointer text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (manualUrl) {
    return (
      <span className="inline-flex items-center gap-1">
        <a
          href={manualUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          title="Abrir link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={() => {
            setDraft(manualUrl);
            setEditing(true);
          }}
          className="cursor-pointer text-muted-foreground hover:text-primary"
          title="Editar link"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft("");
        setEditing(true);
      }}
      className="text-xs text-muted-foreground hover:text-primary underline cursor-pointer"
    >
      + Agregar link
    </button>
  );
}
