# 🛒 Listig

En **mobile first** app för delade listor – handlingslistor, önskelistor och vill ha-listor – som du delar med vänner och familj via en länk.

## Funktioner

- **Tre listtyper**
  - 🛒 **Handlingslista** – bocka av, se vem som bockat av vad.
  - 🎁 **Önskelista** – de du delar med markerar *Jag köper* och sedan *köpt*, och ser vem som köper vad. Ägaren ser **inte** vad som är köpt (inte heller via sortering eller hemliga kommentarer), så överraskningen håller.
    - Öppnar ägaren listan på en annan enhet används en *ägarlänk* (Meny → Kopiera ägarlänk).
    - Den som öppnar en delad önskelista får först frågan *"Är det här din egen lista?"* – svarar man ja döljs allt som är köpt.
  - ✨ **Vill ha-lista** – spara saker du spanar på, prioritera med stjärnor och jämför priser.
- **Dela med en länk** – via mobilens delningsmeny (Web Share API) eller kopiera länken. Ingen inloggning; man anger bara sitt namn första gången.
- **Klistra in en produktlänk** – appen crawlar sidan och hämtar produktnamn, kort info, beskrivning, bild, pris, märke, EAN, kategori och betyg (JSON-LD `Product`, microdata, OpenGraph). Text runt länken blir en anteckning.
  - **PriceRunner-länk** → alla butiker med priser blir en prislista.
  - **Prisjakt-länk** → namn, bild och kategori (Prisjakts butikspriser laddas i webbläsaren och går inte att läsa ut).
  - **Butikslänk** → butiken och priset hamnar under *Var finns den?*.
  - Sidor med bot-skydd (t.ex. Inet, Elgiganten) → namnet gissas från länken.
  - Med `SERPAPI_KEY` söks Google Shopping automatiskt efter fler butiker i bakgrunden.
- **Detaljsida** per sak med bild, pris, mer info om produkten, anteckning, antal, prioritet och **kommentarer**.
- **Var finns den?** – prisjämförelse från Google Shopping (via SerpApi) samt direktlänkar till sökningar på Prisjakt, PriceRunner och Google Shopping.
- Uppdateras automatiskt så alla ser samma lista. Ljust/mörkt läge. Kan läggas till på hemskärmen (PWA-manifest).

## Om pris-API:erna

| Tjänst | Öppet API? | Hur Listig använder den |
|---|---|---|
| Google Shopping | Nej (inget officiellt sök-API) | Via [SerpApi Google Shopping API](https://serpapi.com/google-shopping-api) om `SERPAPI_KEY` är satt – butiker, priser, betyg |
| Prisjakt | Endast partner-API efter ansökan | Länk till sökresultat |
| PriceRunner | Nej (affiliate-feeds via nätverk) | Länk till sökresultat |

Har du partneråtkomst till Prisjakt eller PriceRunner kan du lägga till en provider i [`src/lib/prices.ts`](src/lib/prices.ts).

## Kom igång

```bash
npm install
cp .env.example .env.local   # valfritt: lägg in SERPAPI_KEY
npm run dev
```

Öppna http://localhost:3000 (gärna i mobilvy).

## Teknik

- Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- [libSQL](https://github.com/tursodatabase/libsql) – lokal SQLite-fil i utveckling, [Turso](https://turso.tech) i produktion
- Ingen inloggning: listans id i URL:en är delningsnyckeln; den som skapar listan får en ägartoken (sparas i webbläsaren) som krävs för att byta namn på/ta bort listan.

## Driftsätta

Funkar på t.ex. Vercel: sätt `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` och (valfritt) `SERPAPI_KEY` som miljövariabler.

## API

| Metod | Sökväg | Beskrivning |
|---|---|---|
| `POST` | `/api/lists` | Skapa lista `{ title, type: "shopping" \| "wish" \| "want" }` → `{ list, ownerToken }` |
| `GET` / `PATCH` / `DELETE` | `/api/lists/:id` | Hämta lista med saker / ändra / ta bort (ägare, header `x-owner-token`) |
| `POST` | `/api/lists/:id/items` | Lägg till sak `{ title, url?, author }` – en URL hämtar produktinfo |
| `GET` / `PATCH` / `DELETE` | `/api/items/:id` | Detaljer (kommentarer, erbjudanden, söklänkar) / ändra / ta bort |
| `POST` | `/api/items/:id/comments` | Kommentera `{ body, author, secret? }` |
| `POST` | `/api/items/:id/offers` | Sök priser på Google Shopping |
| `POST` | `/api/items/:id/crawl` | Läs (ny) produktlänk `{ url?, overwriteTitle? }` och uppdatera info + butiker |

## Licens

MIT
