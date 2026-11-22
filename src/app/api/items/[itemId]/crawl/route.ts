import { db } from "@/lib/db";
import { applyProductInfo, searchPricesLater, searchQuery } from "@/lib/product";
import { bad, json, loadItem, loadList, str, toItem } from "@/lib/server";
import { crawlProduct } from "@/lib/unfurl";

type Ctx = { params: Promise<{ itemId: string }> };

/** Crawlar (ny) produktlänk för en befintlig sak och uppdaterar info + butiker. */
export async function POST(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const row = await loadItem(itemId);
  if (!row) return bad("Saken finns inte", 404);
  const found = await loadList(String(row.list_id), req);
  if (!found) return bad("Listan finns inte", 404);
  const body = await req.json().catch(() => ({}));
  const url = str(body.url, 2000) || String(row.url);
  if (!url) return bad("Ingen länk att hämta från");

  const info = await crawlProduct(url);
  if (!info) return bad("Länken kan inte användas");
  await applyProductInfo(itemId, info, Boolean(body.overwriteTitle));
  searchPricesLater(itemId, searchQuery({ title: body.overwriteTitle ? info.title : String(row.title), brand: info.brand }));

  const c = await db();
  const saved = await c.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [itemId] });
  return json({ item: toItem(saved.rows[0], found.surprise), crawled: info.crawled });
}
