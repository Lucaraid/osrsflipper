# Deployment

> Diese Anleitung beschreibt, wie die App veröffentlicht wird. Zum Zeitpunkt der Erstellung ist die App **nicht online** und es existiert keine öffentliche URL.

## Option A: Vercel (empfohlen)

Die App benötigt keine Datenbank und keine Secrets. Die API-Routen laufen als Node-Functions.

1. Code in ein Git-Repository pushen (GitHub, GitLab oder Bitbucket).
2. Auf [vercel.com](https://vercel.com) „Add New → Project“ wählen und das Repository importieren. Framework „Next.js“ wird erkannt. Build-Befehl `npm run build`, Output automatisch.
3. **Environment Variables** setzen:
   - `WIKI_USER_AGENT` = `osrs-ge-flipper - contact: <deine E-Mail oder Discord>` (Pflicht laut Wiki-API)
   - optional `API_RATE_LIMIT_PER_MINUTE` (Standard 120)
   - `MARKET_DATA_SOURCE` **nicht** setzen (Standard `wiki`)
4. „Deploy“ klicken.
5. Prüfen:
   - `https://<deine-domain>/api/health` → `{"ok":true,"source":"wiki",…}`
   - Dashboard lädt, kein gelbes „TESTDATEN“-Banner, Statusanzeige oben rechts „Aktualisiert vor … s“.
   - Scanner zeigt nach wenigen Sekunden „24h-Basis: 24/24 Stundenblöcke“.

Hinweise zu Serverless:

- Der In-Memory-Cache gilt pro Function-Instanz. Zusätzlich cachen das Vercel-CDN (`s-maxage`) und das Wiki-CDN. Die Last auf der Wiki-API bleibt dadurch gering: Massenendpunkte statt Anfragen pro Item, gecachte Stundenblöcke.
- Das Rate-Limit ist ebenfalls pro Instanz. Für strengere globale Limits eignet sich die Vercel WAF / Firewall (Rate Limiting Rules).
- HTTPS und HSTS stellt Vercel automatisch bereit.

## Option B: Eigener Node-Server / PaaS (Render, Railway, Fly.io, VPS)

```bash
npm ci
npm run build
WIKI_USER_AGENT="osrs-ge-flipper - contact: you@example.com" PORT=3000 npm start
```

- Hinter einem Reverse Proxy (nginx, Caddy) TLS terminieren und `X-Forwarded-For` setzen (wird für das Rate-Limit genutzt).
- Prozess-Manager (systemd, pm2) oder Container verwenden.
- Ausgehender Zugriff auf `https://prices.runescape.wiki` muss erlaubt sein. Läuft der Server hinter einem HTTP-Proxy: `HTTPS_PROXY` setzen und Node ≥ 22.21 mit `NODE_USE_ENV_PROXY=1` starten.

Beispiel-Dockerfile:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

## Go-Live-Checkliste

- [ ] `npm run lint`, `npm run typecheck`, `npm test` grün
- [ ] `npm run build && npm run test:e2e` grün
- [ ] `npm audit --omit=dev` ohne relevante Funde
- [ ] `WIKI_USER_AGENT` mit echter Kontaktmöglichkeit gesetzt
- [ ] Datenschutzerklärung (`src/app/datenschutz/page.tsx`) um Betreiberangaben (Name, Kontakt) und die Log-Angaben des Hosters ergänzt; je nach Land ein Impressum hinzufügen
- [ ] Nutzungsbedingungen der Datenquelle geprüft:
  - Wiki-Inhalte stehen unter **CC BY-NC-SA 3.0**: Quellenangabe ist in der App vorhanden. „NC“ heisst **keine kommerzielle Nutzung** (keine Werbung, keine Bezahlfunktionen ohne Klärung).
  - API-Fair-Use: beschreibender User-Agent, Massenendpunkte, keine dauerhaften grossen Anfragen pro Sekunde. Für Änderungsankündigungen den Kanal #api-discussion im Wiki-Discord verfolgen.
  - „RuneScape“ und „Old School RuneScape“ sind Marken von Jagex. Kein Logo verwenden, das ein offizielles Produkt suggeriert.
- [ ] Hosting-Bedingungen des Anbieters geprüft (z. B. Vercel Hobby nur für nicht-kommerzielle Projekte)
- [ ] Nach dem Deploy: `/api/health`, Dashboard, Scanner und Item-Detail mit Chart manuell prüfen

## Monitoring

- Fehler beim Wiki-Abruf werden serverseitig geloggt (`[api] …`, ohne sensible Daten) und erscheinen in den Vercel- oder Server-Logs.
- Für Uptime-Monitoring eignet sich `/api/health` (prüft nur die App) zusammen mit `/api/market` (prüft auch die Datenquelle; 503 bei Ausfall ohne Cache).
