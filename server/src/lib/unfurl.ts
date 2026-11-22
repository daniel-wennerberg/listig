/**
 * Crawlar en produktlänk och plockar ut produktinfo.
 *
 * Källor, i prioritetsordning:
 *  1. JSON-LD `Product` (schema.org) – namn, beskrivning, bild, märke, EAN/GTIN, betyg, priser per butik
 *  2. Microdata (itemprop=…)
 *  3. OpenGraph / meta-taggar
 *  4. URL:en själv (om sidan blockerar oss gissar vi namnet ur länken)
 *
 * Specialfall:
 *  - PriceRunner-produktsidor: JSON-LD innehåller butikslistan med priser → blir erbjudanden.
 *  - Prisjakt-produktsidor: ger namn, bild och kategori. Butikspriserna laddas klientside och
 *    går inte att läsa ut på ett pålitligt sätt.
 *  - Vanlig webbutik: själva butiken blir ett erbjudande.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FoundOffer } from "./prices";

export interface ProductInfo {
  title: string;
  summary: string;
  description: string;
  image: string;
  price: number | null;
  currency: string;
  url: string;
  brand: string;
  gtin: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  siteName: string;
  kind: "shop" | "prisjakt" | "pricerunner";
  offers: FoundOffer[];
  /** false om sidan inte gick att läsa och vi bara gissat utifrån URL:en */
  crawled: boolean;
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// ---------- Säkerhet: hämta aldrig interna adresser (SSRF) ----------

function privateIp(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function isSafeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.replace(/^\[|\]$/g, "");
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(h)) return null;
    if (isIP(h) && privateIp(h)) return null;
    return u;
  } catch {
    return null;
  }
}

async function resolvesPublic(u: URL) {
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(h)) return !privateIp(h);
  try {
    const addrs = await lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

async function fetchHtml(start: URL): Promise<{ html: string; url: URL } | null> {
  let url = start;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (!(await resolvesPublic(url))) return null;
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": UA, "accept-language": "sv-SE,sv;q=0.9,en;q=0.7", accept: "text/html,application/xhtml+xml" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = isSafeUrl(new URL(res.headers.get("location")!, url).toString());
        if (!next) return null;
        url = next;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      return { html: (await res.text()).slice(0, 3_000_000), url };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Hjälpfunktioner för parsning ----------

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é" };

export const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();

const stripTags = (s: string) => decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));

function meta(html: string, ...keys: string[]): string {
  for (const key of keys) {
    const k = key.replace(/[:.]/g, "\\$&");
    const m =
      html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, "i"));
    if (m && m[1].trim()) return decode(m[1]);
  }
  return "";
}

function itemprop(html: string, prop: string): string {
  const m =
    html.match(new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<[^>]+itemprop=["']${prop}["'][^>]*>([^<]{1,300})<`, "i"));
  return m ? decode(m[1]) : "";
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const asStr = (v: unknown): string => (typeof v === "string" ? decode(v) : typeof v === "number" ? String(v) : asObj(v)?.name ? asStr(asObj(v)!.name) : "");
const asNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/\s| /g, "").replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Pris för ett Offer: price, lowPrice eller priceSpecification (utan överstruket ordinarie pris). */
function offerPrice(o: Obj): number | null {
  const direct = asNum(o.price ?? o.lowPrice);
  if (direct != null) return direct;
  const specs = asArr(o.priceSpecification).map(asObj).filter((x): x is Obj => !!x);
  const current = specs.find((x) => !/Strikethrough|ListPrice|SRP|MSRP/i.test(asStr(x.priceType))) ?? specs[0];
  return current ? asNum(current.price) : null;
}

function findProduct(node: unknown): Obj | null {
  for (const n of asArr(node)) {
    const o = asObj(n);
    if (!o) continue;
    const t = asArr(o["@type"]);
    if (t.includes("Product") || t.includes("ProductGroup")) return o;
    const inner = findProduct(o["@graph"]) || findProduct(o.mainEntity) || findProduct(o.itemListElement);
    if (inner) return inner;
  }
  return null;
}

function jsonLdProduct(html: string): Obj | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const p = findProduct(JSON.parse(m[1].trim()));
      if (p) return p;
    } catch {}
  }
  return null;
}

/** "Sony WH-1000XM5 | Webhallen" → "Sony WH-1000XM5" */
export function cleanTitle(raw: string, siteName: string, host: string) {
  let t = decode(raw)
    .replace(/\s*[-–|]\s*Hitta (bästa|lägsta) pris.*$/i, "")
    .replace(/\s*\(\d+\+? butiker\).*$/i, "")
    .replace(/\s*[-–|]\s*(jämför|köp|billigt|bästa pris|lägsta pris|fri frakt)[^|–-]*$/i, "");
  const label = host.replace(/^www\./, "").split(".")[0].toLowerCase();
  const site = siteName.toLowerCase();
  for (let i = 0; i < 2; i++) {
    const parts = t.split(/\s+[|–—-]\s+|\s+\|\s*|\s*\|\s+/);
    if (parts.length < 2) break;
    const last = parts[parts.length - 1].toLowerCase();
    if ((site && (last.includes(site) || site.includes(last))) || last.replace(/\s|\./g, "").includes(label) || /^(se|sverige|sweden)$/.test(last)) {
      t = parts.slice(0, -1).join(" - ");
    } else break;
  }
  return t.trim().slice(0, 200);
}

/** Kort info: de första meningarna, max ~240 tecken. */
export function summarize(text: string, max = 240) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || t.slice(0, max).replace(/\s\S*$/, "") + "…").trim();
}

/** Om sidan inte går att läsa: "…/sony-wh-1000xm5-svart/p/123" → "Sony Wh 1000xm5 Svart" */
export function titleFromUrl(u: URL) {
  const segs = u.pathname
    .split("/")
    .map((s) => decodeURIComponent(s).replace(/\.(html?|aspx?|php)$/i, ""))
    .filter((s) => /[a-zåäö]{3,}/i.test(s) && s.includes("-") && !/^(produkt|product|p|pl|art|sv|se)$/i.test(s));
  const best = segs.sort((a, b) => b.length - a.length)[0];
  if (!best) return u.hostname.replace(/^www\./, "");
  return best
    .replace(/^\d+-/, "")
    .replace(/-priser$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function firstParagraph(html: string) {
  const body = html.replace(/<(script|style|nav|header|footer|noscript)[\s\S]*?<\/\1>/gi, "");
  for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1]);
    if (t.length > 80 && t.length < 1500 && !/cookie|javascript|logga in|nyhetsbrev|©/i.test(t)) return t;
  }
  return "";
}

// ---------- Huvudfunktion ----------

export async function crawlProduct(raw: string): Promise<ProductInfo | null> {
  const start = isSafeUrl(raw);
  if (!start) return null;
  const page = await fetchHtml(start);
  const url = page?.url ?? start;
  const host = url.hostname.replace(/^www\./, "");
  const kind: ProductInfo["kind"] = /(^|\.)prisjakt\.nu$/.test(host) ? "prisjakt" : /(^|\.)pricerunner\.(se|com|dk)$/.test(host) ? "pricerunner" : "shop";

  if (!page) {
    // Blockerad (t.ex. bot-skydd) – gissa namnet ur länken så användaren har något att utgå från.
    return {
      title: titleFromUrl(url), summary: "", description: "", image: "", price: null, currency: "SEK", url: url.toString(),
      brand: "", gtin: "", category: "", rating: null, reviewCount: null, siteName: host, kind, crawled: false,
      offers: kind === "shop" ? [{ source: "Länk", merchant: host, title: titleFromUrl(url), price: null, currency: "SEK", link: url.toString(), thumbnail: "", rating: null, reviews: null }] : [],
    };
  }

  const { html } = page;
  const p = jsonLdProduct(html);
  const siteName = meta(html, "og:site_name") || host;

  // Priser / erbjudanden från JSON-LD
  const offerNodes = asArr(p?.offers).flatMap((o) => {
    const ob = asObj(o);
    return ob && asArr(ob["@type"]).includes("AggregateOffer") && ob.offers ? [ob, ...asArr(ob.offers)] : [o];
  });
  const agg = offerNodes.map(asObj).find((o) => o && asArr(o["@type"]).includes("AggregateOffer"));
  const single = offerNodes.map(asObj).filter((o): o is Obj => !!o && !asArr(o["@type"]).includes("AggregateOffer"));
  const prices = single.map(offerPrice).filter((n): n is number => n != null && n > 0);

  let price =
    asNum(agg?.lowPrice) ??
    (prices.length ? Math.min(...prices) : null) ??
    asNum(meta(html, "product:price:amount", "og:price:amount", "twitter:data1")) ??
    asNum(itemprop(html, "price"));
  if (price === 0) price = null;
  const spec0 = asObj(asArr(single[0]?.priceSpecification)[0]);
  const currency = asStr(agg?.priceCurrency) || asStr(single[0]?.priceCurrency) || asStr(spec0?.priceCurrency) || meta(html, "product:price:currency", "og:price:currency") || itemprop(html, "priceCurrency") || "SEK";

  // Namn, bild, beskrivning
  const rawTitle = asStr(p?.name) || itemprop(html, "name") || meta(html, "og:title", "twitter:title") || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
  const title = cleanTitle(rawTitle, siteName, host) || titleFromUrl(url);

  const imgNode = asArr(p?.image)[0];
  const imgRaw = asStr(imgNode) || asStr(asObj(imgNode)?.url) || meta(html, "og:image", "twitter:image") || itemprop(html, "image");
  let image = "";
  try {
    image = imgRaw ? new URL(imgRaw, url).toString() : "";
  } catch {}

  let description = asStr(p?.description) || itemprop(html, "description") || meta(html, "og:description", "description", "twitter:description");
  let category = asStr(p?.category);
  // Prisjakt: "Jämför priser på <namn> <kategori>." – plocka ut kategorin, det är ingen beskrivning.
  const pj = description.match(/^Jämför priser på (.+?)\.?$/i);
  if (pj) {
    if (pj[1].startsWith(title)) category ||= pj[1].slice(title.length).trim();
    description = "";
  }
  if (/hitta (lägsta|bästa) pris|jämför priser/i.test(description)) description = "";
  if (!description && kind === "shop") description = firstParagraph(html);
  description = stripTags(description).slice(0, 4000);

  const rating = asNum(asObj(p?.aggregateRating)?.ratingValue);
  const reviewCount = asNum(asObj(p?.aggregateRating)?.ratingCount ?? asObj(p?.aggregateRating)?.reviewCount);
  const brand = asStr(p?.brand) || itemprop(html, "brand") || meta(html, "product:brand", "og:brand");
  const gtin = asStr(p?.gtin13 ?? p?.gtin ?? p?.gtin14 ?? p?.gtin12 ?? p?.ean) || itemprop(html, "gtin13");

  // Var finns den?
  const offers: FoundOffer[] = [];
  const pageUrl = url.toString();
  if (kind === "pricerunner" || kind === "prisjakt") {
    const best = new Map<string, FoundOffer>();
    for (const o of single) {
      const merchant = asStr(asObj(o.seller)?.name ?? o.seller);
      const pr = offerPrice(o);
      if (!merchant || pr == null) continue;
      const prev = best.get(merchant);
      if (!prev || (prev.price ?? Infinity) > pr) {
        const link = asStr(o.url);
        best.set(merchant, {
          source: kind === "pricerunner" ? "PriceRunner" : "Prisjakt",
          merchant, title, price: pr, currency: asStr(o.priceCurrency) || currency,
          link: link && isSafeUrl(new URL(link, url).toString()) ? new URL(link, url).toString() : pageUrl,
          thumbnail: "", rating: null, reviews: null,
        });
      }
    }
    offers.push(...[...best.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)));
    if (!offers.length) {
      const count = asNum(agg?.offerCount);
      offers.push({
        source: kind === "pricerunner" ? "PriceRunner" : "Prisjakt",
        merchant: `${kind === "pricerunner" ? "PriceRunner" : "Prisjakt"}${count ? ` – ${count} butiker` : " – jämför butiker"}`,
        title, price, currency, link: pageUrl, thumbnail: "", rating: null, reviews: null,
      });
    }
  } else {
    offers.push({ source: "Länk", merchant: siteName, title, price, currency, link: pageUrl, thumbnail: "", rating: null, reviews: null });
  }

  return {
    title,
    summary: summarize(description),
    description,
    image,
    price,
    currency: currency.toUpperCase().slice(0, 3),
    url: pageUrl,
    brand,
    gtin: /^\d{8,14}$/.test(gtin) ? gtin : "",
    category,
    rating,
    reviewCount,
    siteName,
    kind,
    offers,
    crawled: true,
  };
}
