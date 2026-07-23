"use client";

import { ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export type StoreType = "shopify" | "woocommerce";

interface MerchStoreTypeSelectorProps {
  value: StoreType;
  onChange: (type: StoreType) => void;
}

/**
 * Fase 1.5 del plan maestro: Merch soporta elegir tipo de tienda, pero solo
 * Shopify está implementado hoy. WooCommerce queda declarado en la UI
 * (deshabilitado) para no rehacer este selector cuando se implemente.
 */
export function MerchStoreTypeSelector({ value, onChange }: MerchStoreTypeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange("shopify")}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
          value === "shopify"
            ? "border-primary bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted"
        )}
      >
        <ShoppingBag className="h-4 w-4" />
        Shopify
      </button>
      <button
        disabled
        title="WooCommerce — próximamente"
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
      >
        <Store className="h-4 w-4" />
        WooCommerce
        <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">Próximamente</span>
      </button>
    </div>
  );
}
