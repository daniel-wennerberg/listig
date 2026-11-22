import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Hälsokontroll för Docker/Coolify/lastbalanserare. */
export async function GET() {
  try {
    const c = await db();
    await c.execute("SELECT 1");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "db" }, { status: 503 });
  }
}
