import { Hono } from "hono";
import { nanoid } from "nanoid";
import { db } from "../lib/db";
import { priceSearchEnabled, searchGoogleShopping, searchLinks } from "../lib/prices";
import { applyProductInfo, replaceOffers, searchPricesLater, searchQuery } from "../lib/product";
import { bad, hidesReservations, json, loadItem, loadList, str, toComment, toItem, toOffer } from "../lib/server";
import { crawlProduct } from "../lib/unfurl";

export const items = new Hono();

async function context(itemId: string, req: Request) {
  const row = await loadItem(itemId);
  if (!row) return null;
  const found = await loadList(String(row.list_id), req);
  if (!found) return null;
  return { row, ...found, hide: hidesReservations(found.list, found.isOwner, found.surprise) };
}

const offersFor = async (itemId: string) =>
  (await (await db()).execute({ sql: "SELECT * FROM offers WHERE item_id = ? ORDER BY price IS NULL, price ASC", args: [itemId] })).rows.map(toOffer);

/** Detaljer: sak, kommentarer, butiker, söklänkar. */
items.get("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  const ctx = await context(itemId, c.req.raw);
  if (!ctx) return bad("Saken finns inte", 404);
  const comments = await (await db()).execute({
    sql: `SELECT * FROM comments WHERE item_id = ? ${ctx.hide ? "AND secret = 0" : ""} ORDER BY created_at ASC`,
    args: [itemId],
  });
  const item = toItem(ctx.row, ctx.hide);
  return json({
    item,
    list: ctx.list,
    isOwner: ctx.isOwner,
    surprise: ctx.hide,
    comments: comments.rows.map(toComment),
    offers: await offersFor(itemId),
    searchLinks: searchLinks(searchQuery(item)),
    priceSearchEnabled: priceSearchEnabled(),
  });
});

items.patch("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  const ctx = await context(itemId, c.req.raw);
  if (!ctx) return bad("Saken finns inte", 404);
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, val: string | number | null) => {
    sets.push(`${col} = ?`);
    args.push(val);
  };

  if ("title" in body) {
    const t = str(body.title, 200);
    if (!t) return bad("Titel får inte vara tom");
    set("title", t);
  }
  if ("note" in body) set("note", str(body.note, 1000));
  if ("description" in body) set("description", str(body.description, 4000));
  if ("url" in body) set("url", str(body.url, 2000));
  if ("image" in body) set("image", str(body.image, 2000));
  if ("quantity" in body) set("quantity", Math.max(1, Math.min(999, Number(body.quantity) || 1)));
  if ("priority" in body) set("priority", Math.max(0, Math.min(2, Number(body.priority) || 0)));
  if ("price" in body) {
    const p = body.price === null || body.price === "" ? null : Number(body.price);
    set("price", p != null && Number.isFinite(p) ? p : null);
  }
  if (ctx.hide && ("checked" in body || "reserved" in body))
    return bad("På din egen önskelista kan du inte se eller ändra vad som är köpt", 403);
  if ("checked" in body) {
    set("checked", body.checked ? 1 : 0);
    set("checked_by", body.checked ? str(body.author, 40) : "");
  }
  if ("reserved" in body) {
    if (ctx.isOwner && ctx.list.type === "wish") return bad("Du kan inte reservera från din egen önskelista", 403);
    const current = String(ctx.row.reserved_by);
    const me = str(body.author, 40);
    if (body.reserved) {
      if (current && current !== me) return bad(`Redan reserverad av ${current}`, 409);
      set("reserved_by", me || "Någon");
    } else {
      set("reserved_by", "");
      set("checked", 0);
      set("checked_by", "");
    }
  }
  if (!sets.length) return bad("Inget att uppdatera");

  const client = await db();
  args.push(itemId);
  await client.execute({ sql: `UPDATE items SET ${sets.join(", ")} WHERE id = ?`, args });
  const row = await client.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [itemId] });
  return json({ item: toItem(row.rows[0], ctx.hide) });
});

items.delete("/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  const ctx = await context(itemId, c.req.raw);
  if (!ctx) return bad("Saken finns inte", 404);
  await (await db()).batch(
    [
      { sql: "DELETE FROM comments WHERE item_id = ?", args: [itemId] },
      { sql: "DELETE FROM offers WHERE item_id = ?", args: [itemId] },
      { sql: "DELETE FROM items WHERE id = ?", args: [itemId] },
    ],
    "write",
  );
  return json({ ok: true });
});

/** Kommentera. Hemliga kommentarer på önskelistor döljs för ägaren. */
items.post("/:itemId/comments", async (c) => {
  const itemId = c.req.param("itemId");
  const ctx = await context(itemId, c.req.raw);
  if (!ctx) return bad("Saken finns inte", 404);
  const body = await c.req.json().catch(() => ({}));
  const text = str(body.body, 2000);
  if (!text) return bad("Kommentaren är tom");
  const secret = ctx.list.type === "wish" && !ctx.surprise && Boolean(body.secret);
  const comment = {
    id: nanoid(12),
    item_id: itemId,
    author: str(body.author, 40) || "Anonym",
    body: text,
    secret: secret ? 1 : 0,
    created_at: Date.now(),
  };
  await (await db()).execute({
    sql: "INSERT INTO comments (id, item_id, author, body, secret, created_at) VALUES (:id, :item_id, :author, :body, :secret, :created_at)",
    args: comment,
  });
  return json({ comment: toComment(comment as never) }, 201);
});

/** Sök priser på Google Shopping (kräver SERPAPI_KEY). */
items.post("/:itemId/offers", async (c) => {
  const itemId = c.req.param("itemId");
  const row = await loadItem(itemId);
  if (!row) return bad("Saken finns inte", 404);
  if (!priceSearchEnabled()) return bad("Prissökning är inte konfigurerad (SERPAPI_KEY saknas)", 501);
  const body = await c.req.json().catch(() => ({}));
  const q = str(body.q, 200) || searchQuery({ title: String(row.title), brand: String(row.brand ?? "") });
  try {
    await replaceOffers(itemId, await searchGoogleShopping(q), "google");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Sökningen misslyckades", 502);
  }
  return json({ offers: await offersFor(itemId) });
});

/** Läs (ny) produktlänk och uppdatera info + butiker. */
items.post("/:itemId/crawl", async (c) => {
  const itemId = c.req.param("itemId");
  const ctx = await context(itemId, c.req.raw);
  if (!ctx) return bad("Saken finns inte", 404);
  const body = await c.req.json().catch(() => ({}));
  const url = str(body.url, 2000) || String(ctx.row.url);
  if (!url) return bad("Ingen länk att hämta från");

  const info = await crawlProduct(url);
  if (!info) return bad("Länken kan inte användas");
  await applyProductInfo(itemId, info, Boolean(body.overwriteTitle));
  searchPricesLater(itemId, searchQuery({ title: body.overwriteTitle ? info.title : String(ctx.row.title), brand: info.brand }));

  const saved = await (await db()).execute({ sql: "SELECT * FROM items WHERE id = ?", args: [itemId] });
  return json({ item: toItem(saved.rows[0], ctx.hide), crawled: info.crawled });
});
