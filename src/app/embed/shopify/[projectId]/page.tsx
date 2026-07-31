import { getEmbedCatalog } from "@/lib/shopify-embed";
import { THEME_PALETTES, isThemeColorKey } from "@/lib/theme-palettes";
import { formatCurrency } from "@/lib/constants";

// Página 100% pública, sin requireAuth() a propósito — se carga desde un
// <iframe> en un sitio externo (gamuza.cl) sin ninguna sesión. Ver
// src/lib/shopify-embed.ts para qué datos expone y por qué es seguro.
export const dynamic = "force-dynamic";

export default async function ShopifyEmbedPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const catalog = await getEmbedCatalog(projectId);

  if (!catalog) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#666", textAlign: "center" }}>
        No hay productos disponibles.
      </div>
    );
  }

  const palette = THEME_PALETTES[isThemeColorKey(catalog.themeColor) ? catalog.themeColor : "azul"];
  const cartActionUrl = `https://${catalog.shopDomain}/cart/add`;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, background: "transparent" }}>
      {catalog.products.length === 0 ? (
        <p style={{ color: "#666", textAlign: "center" }}>No hay productos disponibles por ahora.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {catalog.products.map((product) => {
            const singleVariant = product.variants.length === 1 ? product.variants[0] : null;

            return (
              <div
                key={product.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ aspectRatio: "1 / 1", background: "#f3f4f6", position: "relative" }}>
                  {product.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#111827" }}>{product.title}</p>
                  {product.price != null && (
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: palette.primary }}>
                      {formatCurrency(product.price)}
                    </p>
                  )}

                  <form
                    action={cartActionUrl}
                    method="get"
                    target="_top"
                    style={{ marginTop: "auto", display: "flex", gap: 6 }}
                  >
                    {singleVariant ? (
                      <input type="hidden" name="id" value={singleVariant.id} />
                    ) : (
                      <select
                        name="id"
                        style={{
                          flex: 1,
                          fontSize: 13,
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          padding: "6px 8px",
                        }}
                      >
                        {product.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title}
                          </option>
                        ))}
                      </select>
                    )}
                    <input type="hidden" name="quantity" value="1" />
                    <button
                      type="submit"
                      style={{
                        background: palette.primary,
                        color: palette.primaryForeground,
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Comprar
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
