# 🌱 Agriculturai

> AI-powered agricultural assistant for Portuguese farmers — plant disease identification, satellite vegetation analysis, real-time weather forecasts, and a multi-turn agronomic chatbot. 100% free, no subscriptions.

**Live demo:** [agriculturai.pages.dev](https://danielbailote-1998.github.io/agriculturai/) <!-- update with your actual URL -->

---

## What it does

| Feature | Description | Data source |
|---|---|---|
| 🔬 Plant identification | Upload a photo of a leaf, fruit or bark — get a phytosanitary diagnosis with EPPO code and treatment advice | PlantNet API + Groq LLaMA 3.1 |
| 🛰️ Satellite analysis | Draw a field polygon on a map and get NDVI / NDWI indices from recent Sentinel-2 imagery | Sentinel Hub + Sentinel-2 |
| 🌤️ Weather forecast | 5-day forecast for any Portuguese location with agronomic reading (frost risk, spray window, irrigation) | IPMA Open Data |
| 💬 Agronomic chat | Multi-turn assistant for crops, pests, soil, IFAP subsidies and techniques — answers in European Portuguese | Groq LLaMA 3.1 → Cloudflare Workers AI fallback |

---

## Tech stack

```
Frontend          Vue 3 (Composition API) + Vite
Styling           Scoped CSS, CSS custom properties, no CSS framework
Icons             lucide-vue-next
Maps              Leaflet + leaflet-draw
Backend / proxy   Cloudflare Workers (3 separate workers)
LLM               Groq llama-3.1-8b-instant (primary)
LLM fallback      Cloudflare Workers AI @cf/meta/llama-3.1-8b-instruct
Plant ID          PlantNet Identify API
Satellite         Sentinel Hub Statistical API (Sentinel-2 L2A)
Weather           IPMA Open Data (public, no key required)
```

---

## Architecture

```
Browser (Vue 3 SPA)
    │
    ├── /weather/* ──────────────► Cloudflare Worker (curly-pond)
    │                                   └── proxy → IPMA Open Data
    │
    ├── POST / (chat) ───────────► Cloudflare Worker (curly-pond)
    │                                   ├── Groq API (GROQ_API_KEY in env)
    │                                   └── Workers AI (fallback)
    │
    ├── /identify/* ─────────────► Cloudflare Worker (cold-resonance)
    │                                   └── PlantNet API (key in env)
    │
    └── /process ────────────────► Cloudflare Worker (falling-sun)
                                        └── Sentinel Hub API (key in env)
```

All API keys live exclusively in Cloudflare Worker environment variables — never in the frontend bundle.

---

## Running locally

### Prerequisites

- Node.js ≥ 18
- A Cloudflare account (free) with three Workers deployed
- A Groq API key (free at [console.groq.com](https://console.groq.com))
- A PlantNet API key (free at [my.plantnet.org](https://my.plantnet.org))
- A Sentinel Hub account (free at [shapps.planet.com/sentinel-hub](https://shapps.planet.com/sentinel-hub))

### 1. Clone and install

```bash
git clone https://github.com/danielbailote-1998/agriculturai.git
cd agriculturai
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
VITE_WORKER_URL=https://your-sentinel-worker.workers.dev
```

The chat and identify worker URLs are hardcoded in `src/services/chat.js` and `src/services/identify.js` — update them to point to your own deployed workers.

### 3. Deploy the Workers

Each Worker lives in its own Cloudflare project. Set secrets with Wrangler — **never commit secrets to the repo**:

```bash
# Chat + weather worker
wrangler secret put GROQ_API_KEY

# Identify worker
wrangler secret put PLANTNET_API_KEY

# Satellite worker
wrangler secret put SENTINEL_CLIENT_ID
wrangler secret put SENTINEL_CLIENT_SECRET
```

### 4. Start dev server

```bash
npm run dev
```

---

## Deployment

The frontend deploys to **Cloudflare Pages**:

```bash
npm run build
# then push to GitHub — Cloudflare Pages picks it up automatically
```

---

## Rate limits (free tiers)

| Service | Free limit | What happens when reached |
|---|---|---|
| Groq | 30 req/min · 14,400 req/day | User sees a friendly message with retry timer. No fallback (avoids double billing). |
| Cloudflare Workers AI | ~10,000 neurons/day | User sees a friendly message |
| PlantNet | 500 identifications/day | User sees a friendly message. Resets at midnight UTC. |
| Sentinel Hub | 30,000 processing units/month | Request fails gracefully with user message |
| IPMA | Unlimited | Public API, no key |

---

## Project structure

```
src/
├── components/
│   ├── HomeScreen.vue          # Landing + navigation cards
│   ├── ChatAssistant.vue       # Multi-turn agronomic chatbot
│   ├── DiseaseIdentifier.vue   # PlantNet photo identification
│   ├── SatelliteMap.vue        # NDVI/NDWI field analysis
│   └── WeatherCard.vue         # IPMA 5-day forecast + Q&A
├── services/
│   ├── chat.js                 # askAssistant() — Cloudflare Worker proxy
│   ├── identify.js             # identificarDoenca() — PlantNet proxy
│   ├── weather.js              # getZonas() / getPrevisao() — IPMA proxy
│   └── satellite.js            # processIndex() — Sentinel Hub proxy
└── App.vue                     # Shell: sidebar / top-bar / bottom-nav
```

---

## Disclaimer

Agriculturai is a **proof-of-concept demo** of AI applied to Portuguese agriculture.

- Phytosanitary identifications are automated and do not replace a licensed agronomist or DGAV diagnosis.
- Fertilisation doses and IFAP subsidy values are indicative — always confirm with INIAV manuals or a qualified technician.
- Satellite indices may vary with cloud cover, shadows and seasonality.

---

## Author

**Daniel Bailote** — Agronomist · Salesforce Developer at Capgemini Portugal

Master's in Agronomic Engineering, University of Évora. Research in soil science and the Montado ecosystem.

- GitHub: [@danielbailote-1998](https://github.com/danielbailote-1998)
- Email: danielbailotedev@gmail.com

---

## License

MIT — feel free to fork, adapt and build on it.

---

## GitHub Pages deployment

This project deploys automatically via GitHub Actions on every push to `main`.

The workflow (`.github/workflows/deploy.yml`):
1. Runs `npm ci`
2. Runs `npm run build` with `VITE_WORKER_URL` set
3. Uploads the `dist/` folder as a Pages artifact
4. Deploys to `https://danielbailote-1998.github.io/agriculturai/`

**One-time setup in your repo settings:**
Go to **Settings → Pages → Source** and set it to **GitHub Actions**.