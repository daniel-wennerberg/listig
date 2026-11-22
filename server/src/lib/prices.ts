/**
 * Prisjämförelse.
 *
 * - Google Shopping: via SerpApi (https://serpapi.com/google-shopping-api) om SERPAPI_KEY är satt.
 *   Google har inget öppet Shopping-sök-API, så SerpApi är det praktiska sättet.
 * - Prisjakt & PriceRunner: har inga öppna publika API:er (Prisjakt har ett partner-API,
 *   PriceRunner har affiliate-feeds via t.ex. Partner-Ads/Awin). Vi länkar därför till deras
 *   sökresultat. Lägg till en provider här när du har partneråtkomst.
 */

export interface FoundOffer {
  source: string;
  merchant: string;
  title: string;
  price: number | null;
  currency: string;
  link: string;
  thumbnail: string;
  rating: number | null;
  reviews: number | null;
}

export function searchLinks(q: string) {
  const e = encodeURIComponent(q);
  return [
    { source: "Prisjakt", url: `https://www.prisjakt.nu/search?search=${e}` },
    { source: "PriceRunner", url: `https://www.pricerunner.se/results?q=${e}` },
    { source: "Google Shopping", url: `https://www.google.com/search?tbm=shop&gl=se&hl=sv&q=${e}` },
  ];
}

export const priceSearchEnabled = () => Boolean(process.env.SERPAPI_KEY);

interface SerpShoppingResult {
  title?: string;
  link?: string;
  product_link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
}

export async function searchGoogleShopping(q: string): Promise<FoundOffer[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    engine: "google_shopping",
    q,
    gl: "se",
    hl: "sv",
    location: "Sweden",
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpApi svarade ${res.status}`);
  const data = (await res.json()) as { shopping_results?: SerpShoppingResult[]; error?: string };
  if (data.error) throw new Error(data.error);
  return (data.shopping_results ?? [])
    .filter((r) => r.title && (r.link || r.product_link))
    .slice(0, 12)
    .map((r) => ({
      source: "Google Shopping",
      merchant: r.source ?? "",
      title: r.title!,
      price: typeof r.extracted_price === "number" ? r.extracted_price : null,
      currency: "SEK",
      link: (r.link || r.product_link)!,
      thumbnail: r.thumbnail ?? "",
      rating: typeof r.rating === "number" ? r.rating : null,
      reviews: typeof r.reviews === "number" ? r.reviews : null,
    }))
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}
