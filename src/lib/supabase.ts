import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno de Supabase (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY)");
}

// createBrowserClient guarda la sesión en cookies (no localStorage)
// para que el servidor con @supabase/ssr pueda leerla en SSR/middleware
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

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
  joined_at: string;
  profile?: UserProfile;
}
