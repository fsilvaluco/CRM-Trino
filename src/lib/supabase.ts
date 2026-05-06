import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Shared client instance with reinit capability
let sharedClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
let lastReinitialize = Date.now();

/**
 * Get Supabase client with optional force-new behavior.
 * Use forceNew: true when you need a fresh client instance for a specific operation.
 */
export function getSupabaseClient(options?: { forceNew?: boolean }) {
  if (options?.forceNew) {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return sharedClient;
}

/**
 * Reinitialize shared Supabase client if needed.
 * Rate-limited to prevent spam (min 5s between reinits).
 * Call this after browser tab resume / visibilitychange events.
 * 
 * @returns The reinitialized (or existing) client instance
 */
export function maybeReinitializeClient() {
  const now = Date.now();
  // Only reinitialize if last reinit was > 5s ago (avoid spam)
  if (now - lastReinitialize > 5000) {
    console.log('[Supabase] Reinitializing shared client after page resume');
    sharedClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
    lastReinitialize = now;
  }
  return sharedClient;
}

// createBrowserClient guarda la sesión en cookies (no localStorage)
// para que el servidor con @supabase/ssr pueda leerla en SSR/middleware
export const supabase = sharedClient;

// Tipos de los roles de organización
export type OrgRole = "owner" | "admin" | "member";

// Tipo del perfil de usuario
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

// Tipo del miembro de organización
export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  status: "pending" | "active";
  joined_at: string;
  profile?: UserProfile;
}
