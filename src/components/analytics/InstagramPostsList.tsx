"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/lib/project-context";
import { formatDate } from "@/lib/constants";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface InstagramPost {
  id: string;
  igMediaId: string;
  mediaType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  engagement: number;
  updatedAt: string;
}

type SortKey = "postedAt" | "reach" | "views" | "likes" | "comments" | "saved" | "shares" | "engagement";

const NUM = new Intl.NumberFormat("es-CL");

const MEDIA_TYPE_LABELS: Record<string, string> = {
  IMAGE: "Foto",
  VIDEO: "Reel",
  CAROUSEL_ALBUM: "Carrusel",
};

function truncateCaption(caption: string | null): string {
  if (!caption) return "Sin descripción";
  return caption.length > 60 ? `${caption.slice(0, 60)}…` : caption;
}

/** Encabezado ordenable tipo Excel: clic muestra flecha y ordena
 * descendente primero (para métricas, ver lo más alto arriba es lo más
 * útil); un segundo clic invierte a ascendente. */
function SortableHead({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeSort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeSort.key === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${isActive ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        {isActive ? (
          activeSort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export function InstagramPostsList() {
  const { activeProject } = useProject();
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "postedAt", dir: "desc" });

  useEffect(() => {
    if (!activeProject) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/analytics/instagram/posts?projectId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setPosts(Array.isArray(d) ? d : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  function handleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />;
  }

  const lastSynced = posts.reduce<string | null>((latest, p) => {
    if (!p.updatedAt) return latest;
    if (!latest || p.updatedAt > latest) return p.updatedAt;
    return latest;
  }, null);

  const sortedPosts = [...posts].sort((a, b) => {
    const av = sort.key === "postedAt" ? (a.postedAt ? new Date(a.postedAt).getTime() : -Infinity) : a[sort.key] ?? -Infinity;
    const bv = sort.key === "postedAt" ? (b.postedAt ? new Date(b.postedAt).getTime() : -Infinity) : b[sort.key] ?? -Infinity;
    return sort.dir === "asc" ? av - bv : bv - av;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Posts y Reels</CardTitle>
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              Actualizado: {format(new Date(lastSynced), "d MMM HH:mm", { locale: es })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin posts sincronizados todavía — se llena con la próxima sincronización.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post</TableHead>
                  <SortableHead label="Fecha" sortKey="postedAt" activeSort={sort} onSort={handleSort} />
                  <SortableHead label="Alcance" sortKey="reach" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Views" sortKey="views" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Me gusta" sortKey="likes" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Comentarios" sortKey="comments" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Guardados" sortKey="saved" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Compartidos" sortKey="shares" activeSort={sort} onSort={handleSort} align="right" />
                  <SortableHead label="Engagement" sortKey="engagement" activeSort={sort} onSort={handleSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        {post.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.thumbnailUrl}
                            alt=""
                            className="h-10 w-10 rounded object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {post.mediaType && (
                              <Badge variant="outline" className="text-xs">
                                {MEDIA_TYPE_LABELS[post.mediaType] ?? post.mediaType}
                              </Badge>
                            )}
                          </div>
                          {post.permalink ? (
                            <Link
                              href={post.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm hover:underline truncate block max-w-[220px]"
                            >
                              {truncateCaption(post.caption)}
                            </Link>
                          ) : (
                            <span className="text-sm truncate block max-w-[220px]">
                              {truncateCaption(post.caption)}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {post.postedAt ? formatDate(new Date(post.postedAt)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{post.reach != null ? NUM.format(post.reach) : "—"}</TableCell>
                    <TableCell className="text-right">{post.views != null ? NUM.format(post.views) : "—"}</TableCell>
                    <TableCell className="text-right">{post.likes != null ? NUM.format(post.likes) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {post.comments != null ? NUM.format(post.comments) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{post.saved != null ? NUM.format(post.saved) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {post.shares != null ? NUM.format(post.shares) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{NUM.format(post.engagement)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
