# Driftsätta Listig

Listig levereras som en **Docker-image** som innehåller både server (`server/`) och klient (`client/`). Samma image körs hos alla leverantörer, så du kan
byta leverantör genom att flytta en enda sak: databasvolymen (`/data`).

```
GitHub ──push──▶ Docker-image ──▶ Coolify / Sliplane / valfri VPS
                                     └── /data/listig.db  (all data)
```

## Alternativ A – Coolify på egen VPS (rekommenderas för flera appar)

1. Hyr en VPS med minst 2 vCPU / 4 GB RAM (t.ex. Hetzner, UpCloud Stockholm, Glesys), Ubuntu 24.04.
2. Installera Coolify (som root):
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
3. Öppna `http://<serverns-ip>:8000`, skapa konto, koppla GitHub.
4. **New Resource → Public/Private repo → `listig`** → Build pack: **Dockerfile**.
5. Under **Storages**: lägg till en volym med destination `/data`.
6. Under **Domains**: t.ex. `https://listig.dindomän.se` (peka domänens A-post till serverns IP). HTTPS ordnas automatiskt.
7. Valfritt under **Environment variables**: `SERPAPI_KEY`.
8. Deploy. Varje push till `main` driftsätts automatiskt.

Fler appar? Upprepa steg 4–8 – alla delar samma server.

## Alternativ B – Ren VPS med Docker Compose + Caddy

```bash
# på servern
curl -fsSL https://get.docker.com | sh
git clone https://github.com/daniel-wennerberg/listig.git && cd listig
docker compose up -d --build
```

HTTPS med Caddy (installera: https://caddyserver.com/docs/install), `/etc/caddy/Caddyfile`:

```
listig.dindomän.se {
    reverse_proxy 127.0.0.1:3000
}
```

Uppdatera: `git pull && docker compose up -d --build`

## Backup

All data finns i en SQLite-fil i volymen `/data`.

```bash
# Compose: kopiera ut databasen
docker compose exec listig node -e "require('fs').copyFileSync('/data/listig.db','/data/backup.db')"
docker compose cp listig:/data/backup.db ./listig-$(date +%F).db
```

Coolify har inbyggd schemalagd backup av volymer till S3-kompatibel lagring.

## Byta leverantör

1. Ta backup enligt ovan.
2. Driftsätt på nya stället (A eller B).
3. Kopiera in filen som `/data/listig.db` i nya volymen och starta om.
4. Peka om domänen.

## Hostad databas i stället för fil (valfritt)

Vill du köra flera instanser eller serverless (t.ex. Vercel): sätt
`DATABASE_URL=libsql://…` och `DATABASE_AUTH_TOKEN=…` (Turso eller egen `sqld`). Ingen kodändring behövs.

## Kontroll

`GET /api/health` → `{"ok":true}` när appen och databasen fungerar. Används av Dockers HEALTHCHECK.
