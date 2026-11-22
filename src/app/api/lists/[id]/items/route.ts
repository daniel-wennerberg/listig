import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { applyProductInfo, searchPricesLater, searchQuery } from "@/lib/product";
import { bad, json, loadList, str, toItem } from "@/lib/server";
import { crawlProduct, isSafeUrl } from "@/lib/unfurl";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await loadList(id, req);
  if (!found) return bad("Listan finns inte", 404);
  const body = await req.json().catch(() => ({}));

  let title = str(body.title, 2000);
  let url = str(body.url, 2000);
  let note = str(body.note, 1000);
  // Klistrade man in en länk (ev. med text runt om)? Gör om den till en produkt –
  // produktnamnet hämtas från sidan och texten runt länken blir en anteckning.
  const pasted = title.match(/https?:\/\/\S+/)?.[0];
  if (!url && pasted && isSafeUrl(pasted)) {
    url = pasted;
    note = [title.replace(pasted, "").trim(), note].filter(Boolean).join("\n").slice(0, 1000);
    title = "";
  }
  title = title.slice(0, 200);

  const info = url ? await crawlProduct(url) : null;
  if (url && !info) return bad("Länken kan inte användas");
  title ||= info?.title ?? "";
  if (!title) return bad("Skriv vad du vill lägga till");

  const row = {
    id: nanoid(12),
    list_id: id,
    title,
    note,
    quantity: Math.max(1, Math.min(999, Number(body.quantity) || 1)),
    created_by: str(body.author, 40),
    created_at: Date.now(),
  };
  const c = await db();
  await c.execute({
    sql: `INSERT INTO items (id, list_id, title, note, quantity, created_by, created_at)
          VALUES (:id, :list_id, :title, :note, :quantity, :created_by, :created_at)`,
    args: row,
  });
  if (info) await applyProductInfo(row.id, info, false);
  // Google Shopping för saker från länkar – och för önske-/vill ha-listor även utan länk
  if (info || found.list.type !== "shopping") searchPricesLater(row.id, searchQuery({ title, brand: info?.brand }));

  const saved = await c.execute({ sql: "SELECT *, 0 AS comment_count FROM items WHERE id = ?", args: [row.id] });
  return json({ item: toItem(saved.rows[0]), crawled: info?.crawled ?? null }, 201);
}
