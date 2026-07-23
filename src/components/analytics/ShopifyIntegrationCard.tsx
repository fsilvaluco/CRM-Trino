"use client";

import { useState } from "react";
import { ShoppingBag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface ShopifyIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  collectionTitle?: string | null;
}

interface ShopifyIntegrationCardProps {
  integration: ShopifyIntegration;
  onRefresh: () => void;
  projectId?: string;
}

export function ShopifyIntegrationCard({ integration, onRefresh, projectId }: ShopifyIntegrationCardProps) {
  const [shopDomain, setShopDomain] = useState("");
  const [collectionHandle, setCollectionHandle] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = () => {
    if (!projectId) {
      toast.error("Selecciona un proyecto antes de conectar");
      return;
    }
    if (!shopDomain || !collectionHandle) {
      toast.error("Completa el dominio de la tienda y el handle de la colección");
      return;
    }
    const params = new URLSearchParams({ projectId, shopDomain, collectionHandle });
    // Redirect completo (no fetch): el flujo OAuth de Shopify necesita
    // salir de nuestra app hacia el admin de la tienda para pedir permiso.
    window.location.href = `/api/integrations/shopify/connect?${params.toString()}`;
  };

  const handleSync = async () => {
    if (!projectId) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sincronizado — ${data.productsCount} productos, ${data.monthsUpdated} meses`);
        onRefresh();
      } else {
        toast.error(data?.error ?? "Error al sincronizar");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!projectId) return;
    if (!confirm("¿Desconectar Shopify? Se eliminará el catálogo e historial de ventas sincronizado de este proyecto.")) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/shopify/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        toast.success("Shopify desconectado");
        onRefresh();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al desconectar");
      }
    } finally {
      setDisconnecting(false);
    }
  };

  if (integration.connected) {
    return (
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium leading-none mb-1">
              {integration.accountName}
              {integration.collectionTitle && (
                <span className="text-muted-foreground font-normal"> · Colección: {integration.collectionTitle}</span>
              )}
            </p>
            {integration.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Último sync: {format(new Date(integration.lastSyncAt), "d MMM HH:mm", { locale: es })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || disconnecting}>
            {syncing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Sincronizar ahora
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDisconnect}
            disabled={syncing || disconnecting}
          >
            {disconnecting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Desconectar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium leading-none mb-1">Conectar Shopify</p>
          <p className="text-xs text-muted-foreground">
            Solo lectura — trae inventario, productos y ventas de UNA colección. Te vamos a redirigir al admin de la
            tienda para aprobar el acceso.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="shop_domain">Dominio de la tienda</Label>
          <Input
            id="shop_domain"
            placeholder="katarsis-store.myshopify.com"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collection_handle">Handle de la colección</Label>
          <Input
            id="collection_handle"
            placeholder="merch-gamuza"
            value={collectionHandle}
            onChange={(e) => setCollectionHandle(e.target.value)}
          />
        </div>
      </div>
      <Button size="sm" onClick={handleConnect}>
        Conectar con Shopify
      </Button>
    </div>
  );
}
