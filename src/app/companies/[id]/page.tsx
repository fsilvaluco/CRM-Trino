"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "@/components/companies/CompanyForm";
import {
  Building2,
  ArrowLeft,
  Pencil,
  Trash2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Users,
  Briefcase,
  FolderKanban,
  CheckSquare,
} from "lucide-react";
import { formatDate } from "@/lib/constants";
import { useLocale } from "@/lib/locale-context";
import { toast } from "sonner";
import type { Company, Contact, Deal, Project, Task } from "@/types";

interface CompanyDetail extends Company {
  contacts: Contact[];
  deals: Deal[];
  projects: Project[];
  tasks: Task[];
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { formatCurrency } = useLocale();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const loadCompany = () => {
    fetch(`/api/companies/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCompany(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadCompany();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta empresa?")) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Empresa eliminada");
      router.push("/companies");
    } catch {
      toast.error("Error al eliminar empresa");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!company) {
    return <p className="text-muted-foreground">Empresa no encontrada.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Atras
          </Button>
          <div className="rounded-lg bg-primary/10 p-2">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            {company.industry && (
              <p className="text-sm text-muted-foreground">{company.industry}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEdit(true)}
            className="cursor-pointer"
          >
            <Pencil className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="cursor-pointer text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CompanyForm
        open={showEdit}
        initialData={company}
        onClose={() => {
          setShowEdit(false);
          loadCompany();
        }}
      />

      {/* Info */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Globe className="h-4 w-4 shrink-0" />
              {company.website}
            </a>
          )}
          {company.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              {company.email}
            </div>
          )}
          {company.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              {company.phone}
            </div>
          )}
          {company.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              {company.address}
            </div>
          )}
          {company.notes && (
            <div className="md:col-span-2 text-sm text-muted-foreground">
              {company.notes}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contactos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contactos ({company.contacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin contactos asociados.</p>
            ) : (
              <ul className="space-y-2">
                {company.contacts.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between text-sm cursor-pointer hover:text-primary"
                    onClick={() => router.push(`/contacts/${c.id}`)}
                  >
                    <span>{c.name}</span>
                    {c.email && <span className="text-muted-foreground text-xs">{c.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Deals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Deals ({company.deals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin deals asociados.</p>
            ) : (
              <ul className="space-y-2">
                {company.deals.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between text-sm cursor-pointer hover:text-primary"
                    onClick={() => router.push(`/deals/${d.id}`)}
                  >
                    <span>{d.title}</span>
                    <span className="font-medium text-primary">{formatCurrency(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Proyectos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="h-4 w-4" />
              Proyectos ({company.projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin proyectos asociados.</p>
            ) : (
              <ul className="space-y-2">
                {company.projects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-sm cursor-pointer hover:text-primary"
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <span>{p.name}</span>
                    <Badge variant="secondary" className="text-xs">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Tareas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Tareas ({company.tasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin tareas asociadas.</p>
            ) : (
              <ul className="space-y-2">
                {company.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className={t.status === "listo" || t.status === "descartado" ? "line-through text-muted-foreground" : ""}>
                      {t.title}
                    </span>
                    <Badge variant="secondary" className="text-xs">{t.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
