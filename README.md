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

Har du partneråtkomst till Prisjakt eller PriceRunner kan du lägga till en provider i [`server/src/lib/prices.ts`](server/src/lib/prices.ts).

## Struktur

```
listig/
├── client/            🖥️  React 19 + Vite + React Router + Tailwind 4
│   ├── src/pages/       Home, ListPage, ItemPage
│   ├── src/components/  UI-komponenter
│   └── src/lib.ts       API-anrop, localStorage, hjälpfunktioner
├── server/            ⚙️  Node 22 + Hono + libSQL (SQLite)
│   ├── src/routes/      lists.ts, items.ts  (REST-API under /api)
│   └── src/lib/         databas, crawler, prissökning
├── shared/            🔁  Typer som både klient och server använder
├── Dockerfile         📦  Bygger båda → en image
└── docker-compose.yml
```

I produktion levererar servern även klientens byggda filer, så allt körs i **en container**.
I utveckling körs de separat och Vite skickar vidare `/api` till servern.

## Kom igång

```bash
npm run setup                          # installerar root, server och client
cp server/.env.example server/.env     # valfritt: lägg in SERPAPI_KEY
npm run dev                            # server :3001 + klient :5180
```

Öppna http://localhost:5180 (gärna i mobilvy).

| Kommando | Vad det gör |
|---|---|
| `npm run dev` | Startar server (tsx watch) och klient (Vite) samtidigt |
| `npm run build` | Bygger `client/dist` och `server/dist` |
| `npm start` | Kör produktionsbygget på :3001 (`PORT=3000 npm start` för annan port) |
| `npm run check` | Typkontroll av båda + lint av klienten |

## Teknik

- **Klient:** React 19, Vite, React Router 7, Tailwind CSS 4, självhostade typsnitt (Fontsource)
- **Server:** Node 22, [Hono](https://hono.dev), [libSQL](https://github.com/tursodatabase/libsql) – SQLite-fil som standard, eller hostad via `DATABASE_URL` (t.ex. Turso); byggs med esbuild till en fil
- **Docker:** flerstegsbygge (klient → server → liten körimage)
- Ingen inloggning: listans id i URL:en är delningsnyckeln; den som skapar listan får en ägartoken (sparas i webbläsaren) som krävs för att byta namn på/ta bort listan.

## Driftsätta

Appen körs som en Docker-container, så den kan flyttas mellan leverantörer (Coolify, Sliplane, Hetzner, Glesys, UpCloud, AWS …).

```bash
docker compose up -d --build   # http://localhost:3000, data i volymen listig-data
```

Steg-för-steg för Coolify/VPS, backup och byte av leverantör: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## API

| Metod | Sökväg | Beskrivning |
|---|---|---|
| `POST` | `/api/lists` | Skapa lista `{ title, type: "shopping" \| "wish" \| "want" }` → `{ list, ownerToken }` |
| `GET` / `PATCH` / `DELETE` | `/api/lists/:id` | Hämta lista med saker / ändra / ta bort (ägare, header `x-owner-token`) |
| `POST` | `/api/lists/:id/items` | Lägg till sak `{ title, url?, author }` – en URL hämtar produktinfo |
| `GET` / `PATCH` / `DELETE` | `/api/items/:id` | Detaljer (kommentarer, erbjudanden, söklänkar) / ändra / ta bort |
| `POST` | `/api/items/:id/comments` | Kommentera `{ body, author, secret? }` |
| `POST` | `/api/items/:id/offers` | Sök priser på Google Shopping |
| `GET` | `/api/health` | Hälsokontroll |
| `POST` | `/api/items/:id/crawl` | Läs (ny) produktlänk `{ url?, overwriteTitle? }` och uppdatera info + butiker |

## Licens

MIT
