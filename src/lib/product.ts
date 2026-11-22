import { after } from "next/server";
import { nanoid } from "nanoid";
import { db } from "./db";
import { priceSearchEnabled, searchGoogleShopping, type FoundOffer } from "./prices";
import type { ProductInfo } from "./unfurl";

/** Bästa sökfrågan för prisjämförelse: märke + namn. */
export function searchQuery(item: { title: string; brand?: string }) {
  const brand = (item.brand ?? "").trim();
  return brand && !item.title.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${item.title}` : item.title;
}

export async function replaceOffers(itemId: string, offers: FoundOffer[], scope: "crawl" | "google") {
  const c = await db();
  const now = Date.now();
  await c.batch(
    [
      scope === "google"
        ? { sql: "DELETE FROM offers WHERE item_id = ? AND source = 'Google Shopping'", args: [itemId] }
        : { sql: "DELETE FROM offers WHERE item_id = ? AND source != 'Google Shopping'", args: [itemId] },
      ...offers.map((o) => ({
        sql: `INSERT INTO offers (id, item_id, source, merchant, title, price, currency, link, thumbnail, rating, reviews, fetched_at)
              VALUES (:id, :item_id, :source, :merchant, :title, :price, :currency, :link, :thumbnail, :rating, :reviews, :fetched_at)`,
        args: { id: nanoid(12), item_id: itemId, fetched_at: now, ...o },
      })),
    ],
    "write",
  );
}

/** Söker Google Shopping efter att svaret skickats, så det inte gör tillägget långsamt. */
export function searchPricesLater(itemId: string, q: string) {
  if (!priceSearchEnabled() || !q) return;
  after(async () => {
    try {
      await replaceOffers(itemId, await searchGoogleShopping(q), "google");
    } catch (e) {
      console.error("Prissökning misslyckades", e);
    }
  });
}

/** Sparar crawlad produktinfo på en sak. Befintlig titel behålls om inte overwriteTitle. */
export async function applyProductInfo(itemId: string, info: ProductInfo, overwriteTitle: boolean) {
  const c = await db();
  const fields: Record<string, string | number | null> = {
    url: info.url,
    image: info.image,
    description: info.description,
    summary: info.summary,
    brand: info.brand,
    gtin: info.gtin,
    category: info.category,
    rating: info.rating,
    review_count: info.reviewCount,
  };
  if (info.price != null) {
    fields.price = info.price;
    fields.currency = info.currency;
  }
  if (overwriteTitle && info.title) fields.title = info.title;
  // Skriv inte över bra data med tomma värden om sidan gav mindre den här gången
  const entries = Object.entries(fields).filter(([, v]) => v !== "" && v != null);
  if (entries.length) {
    await c.execute({
      sql: `UPDATE items SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`,
      args: [...entries.map(([, v]) => v), itemId],
    });
  }
  await replaceOffers(itemId, info.offers, "crawl");
}
