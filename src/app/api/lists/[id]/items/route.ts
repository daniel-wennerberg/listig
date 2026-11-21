import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { bad, json, loadList, str, toItem } from "@/lib/server";
import { isSafeUrl, unfurl } from "@/lib/unfurl";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = await loadList(id, req);
  if (!found) return bad("Listan finns inte", 404);
  const body = await req.json().catch(() => ({}));

  let title = str(body.title, 200);
  let url = str(body.url, 2000);
  // Klistrade man in en länk som titel? Gör om den till en produkt.
  if (!url && isSafeUrl(title)) {
    url = title;
    title = "";
  }
  let image = "";
  let description = "";
  let price: number | null = null;
  let currency = "SEK";
  if (url) {
    const info = await unfurl(url);
    if (info) {
      title ||= info.title;
      image = info.image;
      description = info.description;
      price = info.price;
      currency = info.currency || "SEK";
      url = info.url;
    }
    title ||= new URL(url).hostname;
  }
  if (!title) return bad("Skriv vad du vill lägga till");

  const quantity = Math.max(1, Math.min(999, Number(body.quantity) || 1));
  const row = {
    id: nanoid(12),
    list_id: id,
    title,
    note: str(body.note, 1000),
    quantity,
    url,
    image,
    description,
    price,
    currency,
    priority: 0,
    checked: 0,
    checked_by: "",
    reserved_by: "",
    created_by: str(body.author, 40),
    created_at: Date.now(),
  };
  const c = await db();
  await c.execute({
    sql: `INSERT INTO items (id, list_id, title, note, quantity, url, image, description, price, currency, priority, checked, checked_by, reserved_by, created_by, created_at)
          VALUES (:id, :list_id, :title, :note, :quantity, :url, :image, :description, :price, :currency, :priority, :checked, :checked_by, :reserved_by, :created_by, :created_at)`,
    args: row,
  });
  return json({ item: toItem({ ...row, comment_count: 0 } as never) }, 201);
}
