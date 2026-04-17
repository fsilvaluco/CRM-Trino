import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";

function isMissingStatusColumn(message: string | undefined): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return msg.includes("status") && (msg.includes("column") || msg.includes("schema cache"));
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password as string | undefined;
  const fullNameRaw = body?.fullName as string | null | undefined;
  const fullName = fullNameRaw?.trim() || null;

  if (!password || password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: updateUserError } = await supabase.auth.updateUser({
    password,
    data: fullName ? { full_name: fullName } : undefined,
  });

  if (updateUserError) {
    return NextResponse.json({ error: updateUserError.message }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: fullName,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const withStatus = await admin
    .from("organization_members")
    .update({ status: "active" })
    .eq("user_id", user.id);

  if (withStatus.error && isMissingStatusColumn(withStatus.error.message)) {
    return NextResponse.json({ ok: true, statusColumnMissing: true });
  }

  if (withStatus.error) {
    return NextResponse.json({ error: withStatus.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}