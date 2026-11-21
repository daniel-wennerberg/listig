/** Hämtar produktinfo (titel, bild, beskrivning, pris) från en produkt-URL via OpenGraph + JSON-LD. */

export interface Unfurled {
  title: string;
  description: string;
  image: string;
  price: number | null;
  currency: string;
  url: string;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|.*\.local$|.*\.internal$)/i;

export function isSafeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (PRIVATE_HOST.test(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

function meta(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decode(m[1]) : "";
}

type JsonLd = Record<string, unknown>;

function findProduct(node: unknown): JsonLd | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const p = findProduct(n);
      if (p) return p;
    }
    return null;
  }
  const o = node as JsonLd;
  const t = o["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return o;
  if (o["@graph"]) return findProduct(o["@graph"]);
  return null;
}

export async function unfurl(raw: string): Promise<Unfurled | null> {
  const u = isSafeUrl(raw);
  if (!u) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(u, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; Listan/1.0; +https://github.com)",
        "accept-language": "sv-SE,sv;q=0.9,en;q=0.8",
        accept: "text/html",
      },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 1_500_000);

    let product: JsonLd | null = null;
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        product = findProduct(JSON.parse(m[1]));
        if (product) break;
      } catch {}
    }

    const offers = product?.offers as JsonLd | JsonLd[] | undefined;
    const offer = (Array.isArray(offers) ? offers[0] : offers) as JsonLd | undefined;
    const ldPrice = offer?.price ?? offer?.lowPrice;
    const ldImage = product?.image;
    const img = Array.isArray(ldImage) ? ldImage[0] : ldImage;

    const priceRaw = String(ldPrice ?? (meta(html, "product:price:amount") || meta(html, "og:price:amount")));
    const price = parseFloat(priceRaw.replace(/\s/g, "").replace(",", "."));

    const title =
      (typeof product?.name === "string" && product.name) ||
      meta(html, "og:title") ||
      decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const image =
      (typeof img === "string" && img) ||
      (img && typeof img === "object" && typeof (img as JsonLd).url === "string" ? String((img as JsonLd).url) : "") ||
      meta(html, "og:image");

    return {
      title: decode(title).slice(0, 200),
      description: decode(
        (typeof product?.description === "string" && product.description) ||
          meta(html, "og:description") ||
          meta(html, "description"),
      ).slice(0, 2000),
      image: image ? new URL(image, u).toString() : "",
      price: Number.isFinite(price) ? price : null,
      currency: String(offer?.priceCurrency ?? (meta(html, "product:price:currency") || "SEK")),
      url: res.url || u.toString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
