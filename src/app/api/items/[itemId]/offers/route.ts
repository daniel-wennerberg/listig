import { db } from "@/lib/db";
import { priceSearchEnabled, searchGoogleShopping } from "@/lib/prices";
import { replaceOffers, searchQuery } from "@/lib/product";
import { bad, json, loadItem, str, toOffer } from "@/lib/server";

type Ctx = { params: Promise<{ itemId: string }> };

/** Söker priser för saken och sparar träffarna (ersätter tidigare sökning). */
export async function POST(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const row = await loadItem(itemId);
  if (!row) return bad("Saken finns inte", 404);
  if (!priceSearchEnabled()) return bad("Prissökning är inte konfigurerad (SERPAPI_KEY saknas)", 501);
  const body = await req.json().catch(() => ({}));
  const q = str(body.q, 200) || searchQuery({ title: String(row.title), brand: String(row.brand ?? "") });

  let found;
  try {
    found = await searchGoogleShopping(q);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Sökningen misslyckades", 502);
  }
  await replaceOffers(itemId, found, "google");
  const c = await db();
  const all = await c.execute({ sql: "SELECT * FROM offers WHERE item_id = ? ORDER BY price IS NULL, price ASC", args: [itemId] });
  return json({ offers: all.rows.map(toOffer) });
}
