import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const buildId = readFileSync(join(process.cwd(), ".next/BUILD_ID"), "utf8").trim();
    return NextResponse.json({ buildId });
  } catch {
    // In dev mode or if file is missing, return a fixed sentinel
    return NextResponse.json({ buildId: "dev" });
  }
}
