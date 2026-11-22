import { db } from "@/lib/db";
import { searchLinks, priceSearchEnabled } from "@/lib/prices";
import { bad, hidesReservations, json, loadItem, loadList, str, toComment, toItem, toOffer } from "@/lib/server";

type Ctx = { params: Promise<{ itemId: string }> };

async function context(itemId: string, req: Request) {
  const row = await loadItem(itemId);
  if (!row) return null;
  const found = await loadList(String(row.list_id), req);
  if (!found) return null;
  return { row, ...found, hide: hidesReservations(found.list, found.isOwner, found.surprise) };
}

export async function GET(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const ctx = await context(itemId, req);
  if (!ctx) return bad("Saken finns inte", 404);
  const c = await db();
  const [comments, offers] = await Promise.all([
    c.execute({
      sql: `SELECT * FROM comments WHERE item_id = ? ${ctx.hide ? "AND secret = 0" : ""} ORDER BY created_at ASC`,
      args: [itemId],
    }),
    c.execute({ sql: "SELECT * FROM offers WHERE item_id = ? ORDER BY price IS NULL, price ASC", args: [itemId] }),
  ]);
  const item = toItem(ctx.row, ctx.hide);
  return json({
    item,
    list: ctx.list,
    isOwner: ctx.isOwner,
    surprise: ctx.hide,
    comments: comments.rows.map(toComment),
    offers: offers.rows.map(toOffer),
    searchLinks: searchLinks(item.title),
    priceSearchEnabled: priceSearchEnabled(),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const ctx = await context(itemId, req);
  if (!ctx) return bad("Saken finns inte", 404);
  const body = await req.json().catch(() => ({}));
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

  const c = await db();
  args.push(itemId);
  await c.execute({ sql: `UPDATE items SET ${sets.join(", ")} WHERE id = ?`, args });
  const row = await c.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [itemId] });
  return json({ item: toItem(row.rows[0], ctx.hide) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const ctx = await context(itemId, req);
  if (!ctx) return bad("Saken finns inte", 404);
  const c = await db();
  await c.batch(
    [
      { sql: "DELETE FROM comments WHERE item_id = ?", args: [itemId] },
      { sql: "DELETE FROM offers WHERE item_id = ?", args: [itemId] },
      { sql: "DELETE FROM items WHERE id = ?", args: [itemId] },
    ],
    "write",
  );
  return json({ ok: true });
}
