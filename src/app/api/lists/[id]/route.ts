import { db } from "@/lib/db";
import { bad, hidesReservations, json, loadList, str, toItem } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await loadList(id, req);
  if (!found) return bad("Listan finns inte", 404);
  const c = await db();
  const hide = hidesReservations(found.list, found.isOwner);
  const res = await c.execute({
    sql: `SELECT i.*, (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id ${hide ? "AND c.secret = 0" : ""}) AS comment_count
          FROM items i WHERE i.list_id = ? ORDER BY i.checked ASC, i.priority DESC, i.created_at DESC`,
    args: [id],
  });
  return json({ ...found, items: res.rows.map((r) => toItem(r, hide)) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await loadList(id, req);
  if (!found) return bad("Listan finns inte", 404);
  if (!found.isOwner) return bad("Bara ägaren kan ändra listan", 403);
  const body = await req.json().catch(() => ({}));
  const title = str(body.title, 80) || found.list.title;
  const emoji = str(body.emoji, 8) || found.list.emoji;
  const c = await db();
  await c.execute({ sql: "UPDATE lists SET title = ?, emoji = ? WHERE id = ?", args: [title, emoji, id] });
  return json({ list: { ...found.list, title, emoji } });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await loadList(id, req);
  if (!found) return bad("Listan finns inte", 404);
  if (!found.isOwner) return bad("Bara ägaren kan ta bort listan", 403);
  const c = await db();
  await c.batch(
    [
      { sql: "DELETE FROM comments WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)", args: [id] },
      { sql: "DELETE FROM offers WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)", args: [id] },
      { sql: "DELETE FROM items WHERE list_id = ?", args: [id] },
      { sql: "DELETE FROM lists WHERE id = ?", args: [id] },
    ],
    "write",
  );
  return json({ ok: true });
}
