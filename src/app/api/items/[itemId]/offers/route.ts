import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { priceSearchEnabled, searchGoogleShopping } from "@/lib/prices";
import { bad, json, loadItem, str, toOffer } from "@/lib/server";

type Ctx = { params: Promise<{ itemId: string }> };

/** Söker priser för saken och sparar träffarna (ersätter tidigare sökning). */
export async function POST(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const row = await loadItem(itemId);
  if (!row) return bad("Saken finns inte", 404);
  if (!priceSearchEnabled()) return bad("Prissökning är inte konfigurerad (SERPAPI_KEY saknas)", 501);
  const body = await req.json().catch(() => ({}));
  const q = str(body.q, 200) || String(row.title);

  let found;
  try {
    found = await searchGoogleShopping(q);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Sökningen misslyckades", 502);
  }
  const now = Date.now();
  const offers = found.map((o) => ({ id: nanoid(12), item_id: itemId, fetched_at: now, ...o }));
  const c = await db();
  await c.batch(
    [
      { sql: "DELETE FROM offers WHERE item_id = ?", args: [itemId] },
      ...offers.map((o) => ({
        sql: `INSERT INTO offers (id, item_id, source, merchant, title, price, currency, link, thumbnail, rating, reviews, fetched_at)
              VALUES (:id, :item_id, :source, :merchant, :title, :price, :currency, :link, :thumbnail, :rating, :reviews, :fetched_at)`,
        args: o,
      })),
    ],
    "write",
  );
  return json({ offers: offers.map((o) => toOffer(o as never)) });
}
