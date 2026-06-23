<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import {
  Loader2, AlertTriangle, RefreshCw,
  Sparkles, ShieldCheck, Satellite, Clock, Search, X, Info
} from "lucide-vue-next";
import { processIndex, interpretValue } from "../services/satellite.js";
import { askAssistant } from "../services/chat.js";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

/* ── Limites de área ── */
const MAX_AREA_HA   = 2000;  // bloqueio absoluto
const WARN_AREA_HA  = 500;   // aviso de área grande

/* ── Estado principal ── */
const loading       = ref(false);
const erro          = ref("");
const resultado     = ref(null);

/* ── Explicação LLM ── */
const explicacao           = ref("");
const explicandoCarregando = ref(false);
const erroExplicacao       = ref("");
const erroExplicacaoRL     = ref(false);

/* ── Formulário ── */
const index    = ref("ndvi");
const maxCloud = ref(20);
const today    = new Date().toISOString().split("T")[0];
const oneMonthAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().split("T")[0];
const dateFrom = ref(oneMonthAgo);
const dateTo   = ref(today);

/* ── Pesquisa de localidade ── */
const searchQuery   = ref("");
const searchResults = ref([]);
const searchLoading = ref(false);
const showResults   = ref(false);
let searchTimeout   = null;

/* ── Mapa ── */
const mapEl     = ref(null);
const polygon   = ref(null);
const showHint  = ref(true);
let map = null, drawnItems = null;

/* ── Cálculo de área (fórmula de Shoelace com conversão lat/lon→metros) ── */
function calcAreaHa(geometry) {
  if (!geometry?.coordinates?.[0]) return 0;
  const coords = geometry.coordinates[0];
  if (coords.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    // Conversão aproximada para metros (válida para Portugal ~37–42°N)
    const latMid = ((lat1 + lat2) / 2) * Math.PI / 180;
    const x1 = lon1 * 111320 * Math.cos(latMid);
    const y1 = lat1 * 110540;
    const x2 = lon2 * 111320 * Math.cos(latMid);
    const y2 = lat2 * 110540;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2) / 10000; // m² → hectares
}

const areaHa = computed(() => polygon.value ? calcAreaHa(polygon.value) : 0);

const areaLabel = computed(() => {
  const ha = areaHa.value;
  if (ha === 0) return null;
  if (ha < 1) return `${Math.round(ha * 10000)} m²`;
  if (ha < 1000) return `${ha.toFixed(1)} ha`;
  return `${(ha / 100).toFixed(1)} km²`;
});

/* ── Validação ── */
const validationMsg = computed(() => {
  if (!polygon.value) return "Desenhe a parcela no mapa antes de analisar.";
  if (areaHa.value > MAX_AREA_HA)
    return `A área selecionada (${Math.round(areaHa.value).toLocaleString("pt-PT")} ha) excede o limite de ${MAX_AREA_HA.toLocaleString("pt-PT")} ha. Reduz a área desenhada.`;
  if (!dateFrom.value || !dateTo.value) return "Defina o intervalo de datas.";
  if (new Date(dateFrom.value) > new Date(dateTo.value))
    return "A data de início não pode ser posterior à data de fim.";
  return null;
});

const areaWarning = computed(() =>
  polygon.value && areaHa.value > WARN_AREA_HA && areaHa.value <= MAX_AREA_HA
    ? `Área grande (${Math.round(areaHa.value).toLocaleString("pt-PT")} ha) — a análise pode demorar mais.`
    : null
);

const canRun = computed(() => !validationMsg.value && !loading.value);

/* ── Leaflet init ── */
onMounted(() => { initMap(); });
onUnmounted(() => { if (map) { map.remove(); map = null; } });

function initMap() {
  map = L.map(mapEl.value, { zoomControl: false }).setView([39.5, -8.0], 7);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics",
      maxZoom: 19,
    }
  ).addTo(map);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, opacity: 0.7 }
  ).addTo(map);

  drawnItems = new L.FeatureGroup().addTo(map);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems, edit: false },
    draw: {
      polygon:   { shapeOptions: { color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.2, weight: 2.5 } },
      rectangle: { shapeOptions: { color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.2, weight: 2.5 } },
      polyline:     false, circle: false, marker: false, circlemarker: false,
    },
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e) => {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    polygon.value = e.layer.toGeoJSON().geometry;
    showHint.value = false;
    limpar(false);
  });

  map.on(L.Draw.Event.DELETED, () => {
    if (!drawnItems.getLayers().length) {
      polygon.value  = null;
      showHint.value = true;
    }
  });

  map.on("click", () => { showResults.value = false; });
}

/* ── Pesquisa Nominatim ── */
function onSearchInput() {
  clearTimeout(searchTimeout);
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    showResults.value = false;
    return;
  }
  searchTimeout = setTimeout(doSearch, 400);
}

function tipoLabel(item) {
  const tipos = {
    city: "Cidade", town: "Vila", village: "Aldeia", hamlet: "Lugar",
    suburb: "Bairro", neighbourhood: "Bairro", quarter: "Bairro",
    municipality: "Município", county: "Concelho", district: "Distrito",
    region: "Região", state: "Distrito", country: "País",
    farm: "Quinta", residential: "Residencial", industrial: "Industrial",
    commercial: "Comercial", retail: "Comércio", park: "Parque",
    administrative: "",
  };
  const t = (item.addresstype || item.type || "").toLowerCase();
  return tipos[t] || item.class || "";
}

function parseName(item) {
  const parts = item.display_name.split(",").map(s => s.trim()).filter(Boolean);
  const nome = parts[0] || "";
  const sub = parts.slice(1).filter(p => p !== nome).slice(0, 2).join(", ");
  return { nome, sub };
}

async function doSearch() {
  if (!searchQuery.value.trim()) return;
  searchLoading.value = true;
  try {
    const q = encodeURIComponent(searchQuery.value.trim());
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=6&addressdetails=1&accept-language=pt`;
    const res = await fetch(url, { headers: { "Accept-Language": "pt" } });
    const data = await res.json();
    searchResults.value = data;
    showResults.value = data.length > 0;
  } catch {
    searchResults.value = [];
  }
  searchLoading.value = false;
}

function selectResult(item) {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  map.setView([lat, lon], 14);
  showResults.value = false;
  searchQuery.value = parseName(item).nome;
}

function clearSearch() {
  searchQuery.value = "";
  searchResults.value = [];
  showResults.value = false;
}

/* ── Limpar ── */
function limpar(clearMap = true) {
  resultado.value      = null;
  erro.value           = "";
  explicacao.value     = "";
  erroExplicacao.value = "";
  erroExplicacaoRL.value = false;
  if (clearMap) {
    if (drawnItems) drawnItems.clearLayers();
    polygon.value  = null;
    showHint.value = true;
  }
}

/* ── Análise principal ── */
async function analisar() {
  if (!canRun.value) return;

  loading.value   = true;
  erro.value      = "";
  resultado.value = null;
  explicacao.value = "";
  erroExplicacao.value = "";
  erroExplicacaoRL.value = false;

  try {
    const data = await processIndex({
      geometry: polygon.value,
      index:    index.value,
      dateFrom: dateFrom.value,
      dateTo:   dateTo.value,
      maxCloud: maxCloud.value,
    });

    const mean   = data.mean ?? 0;
    const interp = interpretValue(index.value, mean);

    resultado.value = {
      value:    mean,
      min:      data.min   ?? mean,
      max:      data.max   ?? mean,
      count:    data.count ?? 1,
      date:     data.date  ?? null,
      imageUrl: data.image ?? data.imageUrl ?? null,
      interp,
    };

    explicarResultado(resultado.value);

  } catch (err) {
    erro.value = err.message || "Erro ao processar. Verifica a ligação e tenta novamente.";
  }

  loading.value = false;
}

/* ── Explicação LLM ── */
async function explicarResultado(res) {
  explicandoCarregando.value = true;
  erroExplicacao.value = "";
  erroExplicacaoRL.value = false;
  explicacao.value = "";

  try {
    const data = await askAssistant({
      message:  "Explica este resultado de análise satelital e o que o agricultor deve fazer.",
      category: index.value === "ndvi" ? "culturas" : "tecnicas",
      diagnosis: {
        description: `${index.value.toUpperCase()} médio: ${res.value.toFixed(3)} — ${res.interp.label}. `
          + `Mínimo: ${res.min.toFixed(3)}, Máximo: ${res.max.toFixed(3)}. `
          + `Baseado em ${res.count} imagem(ns) Sentinel-2 sem nuvens.`,
        score:    res.value,
        eppoCode: null,
      },
    });
    explicacao.value = data.reply || "";
  } catch (err) {
    if (err.rateLimited) {
      erroExplicacaoRL.value = true;
      erroExplicacao.value = err.message;
    } else {
      erroExplicacao.value =
        "Não foi possível obter a explicação agora. O resultado de análise acima continua válido.";
    }
  }

  explicandoCarregando.value = false;
}

/* ── Escala de referência ── */
const ndviSteps = [
  { label: "Sem vegetação",      short: "<0.1", color: "#92400e" },
  { label: "Vegetação escassa",  short: "<0.2", color: "#dc2626" },
  { label: "Vegetação fraca",    short: "<0.4", color: "#d97706" },
  { label: "Vegetação moderada", short: "<0.6", color: "#16a34a" },
  { label: "Cultura saudável",   short: "<0.8", color: "#15803d" },
  { label: "Vegetação densa",    short: ">0.8", color: "#166534" },
];
const ndwiSteps = [
  { label: "Stress hídrico severo", short: "<-0.2", color: "#dc2626" },
  { label: "Humidade baixa",        short: "<-0.1", color: "#ea580c" },
  { label: "Humidade adequada",     short: "<0.2",  color: "#0284c7" },
  { label: "Bem hidratada",         short: "<0.4",  color: "#0369a1" },
  { label: "Excesso de humidade",   short: ">0.4",  color: "#1d4ed8" },
];
const scaleSteps = computed(() => index.value === "ndvi" ? ndviSteps : ndwiSteps);

function nivelAmplitude(res) {
  const amp = res.max - res.min;
  if (amp < 0.15) return "alta";
  if (amp < 0.35) return "media";
  return "baixa";
}

function resizeMap() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}
defineExpose({ resizeMap });

</script>

<template>
  <div class="identifier">

    <header class="id-head">
      <div>
        <h2>Análise satélite</h2>
        <p>Sentinel-2 · NDVI &amp; NDWI · Sentinel Hub API</p>
      </div>
    </header>

    <!-- Mapa -->
    <div class="map-wrapper">
      <div id="sat-map" ref="mapEl"></div>

      <!-- Pesquisa -->
      <div class="map-search">
        <div class="search-input-wrap">
          <Search :size="14" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Pesquisar localidade…"
            class="search-input"
            @input="onSearchInput"
            @keydown.escape="clearSearch"
            @keydown.enter.prevent="doSearch"
            autocomplete="off"
          />
          <button v-if="searchQuery" class="search-clear" @click="clearSearch" tabindex="-1">
            <X :size="12" />
          </button>
          <Loader2 v-if="searchLoading" :size="13" class="spin search-spinner" />
        </div>
        <ul v-if="showResults && searchResults.length" class="search-results">
          <li
            v-for="item in searchResults"
            :key="item.place_id"
            @click="selectResult(item)"
          >
            <div class="result-info">
              <span class="result-name">{{ parseName(item).nome }}</span>
              <span v-if="parseName(item).sub" class="result-sub">{{ parseName(item).sub }}</span>
            </div>
            <span v-if="tipoLabel(item)" class="result-type">{{ tipoLabel(item) }}</span>
          </li>
        </ul>
      </div>

      <transition name="fade">
        <div v-if="showHint" class="map-hint">
          <span>Desenhe a parcela no mapa para analisar</span>
        </div>
      </transition>

      <!-- Indicador de área em tempo real -->
      <transition name="fade">
        <div v-if="areaLabel" class="area-badge" :class="{ 'area-warn': areaHa > WARN_AREA_HA, 'area-error': areaHa > MAX_AREA_HA }">
          {{ areaLabel }}
        </div>
      </transition>

      <button v-if="polygon" class="btn-clear-map" @click="limpar(true)" title="Limpar polígono">
        <RefreshCw :size="13" /> Limpar
      </button>
    </div>

    <!-- Formulário -->
    <div class="sat-form">

      <!-- Segmented: NDVI / NDWI -->
      <div class="form-group">
        <label class="organ-label">Índice</label>
        <div class="organ-chips">
          <button :class="{ active: index === 'ndvi' }" @click="index = 'ndvi'">
            NDVI — Vegetação
          </button>
          <button :class="{ active: index === 'ndwi' }" @click="index = 'ndwi'">
            NDWI — Humidade
          </button>
        </div>
        <p class="form-hint">
          {{ index === 'ndvi'
            ? 'Mede o vigor e biomassa da cultura através da reflectância no vermelho/infravermelho.'
            : 'Detecta stress hídrico e teor de água foliar através do infravermelho.' }}
        </p>
      </div>

      <!-- Datas -->
      <div class="form-row">
        <div class="form-group">
          <label class="organ-label" for="date-from">Data início</label>
          <input id="date-from" type="date" v-model="dateFrom" :max="dateTo || today" />
        </div>
        <div class="form-group">
          <label class="organ-label" for="date-to">Data fim</label>
          <input id="date-to" type="date" v-model="dateTo" :min="dateFrom" :max="today" />
        </div>
      </div>

      <!-- Nuvens -->
      <div class="form-group">
        <label class="organ-label">Cobertura de nuvens máx. — {{ maxCloud }}%</label>
        <input type="range" min="0" max="100" step="5" v-model.number="maxCloud" />
      </div>

      <!-- Botões -->
      <div class="actions">
        <button class="btn-primary" :disabled="!canRun" @click="analisar">
          <Loader2 v-if="loading" :size="17" class="spin" />
          <Satellite v-else :size="17" />
          {{ loading ? "A processar imagem…" : "Analisar parcela" }}
        </button>
        <button v-if="resultado" class="btn-ghost" @click="limpar(false)">
          <RefreshCw :size="15" />
          Nova análise
        </button>
      </div>

      <!-- Validação inline -->
      <div v-if="validationMsg && !resultado" class="inline-warn">
        <AlertTriangle :size="14" />
        <span>{{ validationMsg }}</span>
      </div>

      <!-- Aviso de área grande (não bloqueia) -->
      <div v-if="areaWarning" class="inline-area-warn">
        <Info :size="14" />
        <span>{{ areaWarning }}</span>
      </div>
    </div>

    <!-- Nota sobre Sentinel Hub -->
    <div class="sentinel-note">
      <Info :size="12" />
      <span>
        Imagens via <strong>Sentinel Hub</strong> (plano gratuito · limite mensal de pedidos).
        Desenha a parcela real — evita áreas superiores a {{ MAX_AREA_HA.toLocaleString('pt-PT') }} ha.
        Se o serviço não responder, tenta novamente mais tarde.
      </span>
    </div>

    <!-- Erro -->
    <div v-if="erro" class="erro-card">
      <AlertTriangle :size="16" />
      <span>{{ erro }}</span>
    </div>

    <!-- Resultados -->
    <div v-if="resultado" class="results">
      <div class="results-header">
        <Satellite :size="14" />
        <span>Resultado da análise Sentinel-2</span>
        <span v-if="resultado.date" class="result-date">{{ resultado.date }}</span>
      </div>

      <div class="result-card" :class="nivelAmplitude(resultado)">
        <div class="result-top">
          <span class="result-name">{{ index.toUpperCase() }} — {{ resultado.interp.label }}</span>
          <div class="result-right">
            <span class="result-index-pill">{{ index.toUpperCase() }}</span>
            <span class="result-score" :class="nivelAmplitude(resultado)">
              {{ resultado.value.toFixed(3) }}
            </span>
          </div>
        </div>

        <div class="metrics-row">
          <div class="metric">
            <span class="metric-label">Mínimo</span>
            <span class="metric-val">{{ resultado.min.toFixed(3) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Médio</span>
            <span class="metric-val primary">{{ resultado.value.toFixed(3) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Máximo</span>
            <span class="metric-val">{{ resultado.max.toFixed(3) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Imagens</span>
            <span class="metric-val">{{ resultado.count }}</span>
          </div>
        </div>

        <div class="meter-wrap">
          <div class="meter">
            <div
              class="meter-fill"
              :style="{
                width: Math.round(((resultado.value + 1) / 2) * 100) + '%',
                background: resultado.interp.color
              }"
            />
          </div>
          <span class="meter-label">{{ resultado.interp.label }}</span>
        </div>

        <div v-if="nivelAmplitude(resultado) === 'baixa'" class="low-conf-warning">
          <AlertTriangle :size="12" />
          Amplitude elevada ({{ (resultado.max - resultado.min).toFixed(2) }}) — a parcela pode ter
          zonas muito heterogéneas. Considera uma análise por sub-zonas.
        </div>
      </div>

      <!-- Imagem Sentinel -->
      <div v-if="resultado.imageUrl" class="result-img-wrap">
        <img :src="resultado.imageUrl" alt="Mapa de falsa cor" class="result-img" />
        <p class="result-img-caption">Imagem Sentinel-2 · falsa cor</p>
      </div>

      <!-- Escala de referência -->
      <div class="scale-wrap">
        <p class="scale-title">Escala {{ index.toUpperCase() }}</p>
        <div class="scale-bar">
          <div
            v-for="s in scaleSteps" :key="s.label"
            class="scale-step"
            :style="{ background: s.color }"
            :title="s.label"
          ></div>
        </div>
        <div class="scale-labels">
          <span v-for="s in scaleSteps" :key="s.label + '_l'" class="scale-lbl">{{ s.short }}</span>
        </div>
      </div>
    </div>

    <!-- Explicação LLM -->
    <div
      v-if="explicandoCarregando || explicacao || erroExplicacao"
      class="explanation-card"
    >
      <div class="explanation-header">
        <Sparkles :size="15" />
        <span>Interpretação e conselho técnico</span>
        <span class="expl-model-badge">Groq · Workers AI</span>
      </div>

      <div v-if="explicandoCarregando" class="expl-loading">
        <Loader2 :size="14" class="spin" />
        <span>A interpretar o índice e a preparar conselho agronómico…</span>
      </div>

      <div v-else-if="erroExplicacaoRL" class="rate-limit-inline">
        <Clock :size="13" />
        <span>{{ erroExplicacao }}</span>
      </div>

      <div v-else-if="erroExplicacao" class="erro-card inline">
        <AlertTriangle :size="14" />
        <span>{{ erroExplicacao }}</span>
      </div>

      <div v-else class="explanation-content">{{ explicacao }}</div>
    </div>

    <!-- Disclaimer -->
    <div v-if="resultado" class="id-disclaimer">
      <ShieldCheck :size="12" />
      <span>
        Análise baseada em imagens Sentinel-2. Valores podem variar com cobertura de nuvens,
        sombras ou sazonalidade. Confirma com técnico agrónomo antes de alterar práticas culturais.
      </span>
    </div>

  </div>
</template>

<style scoped>
.identifier { padding: 32px 0 8px; }

.id-head { margin-bottom: 20px; }
.id-head h2 {
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 3.5vw, 1.6rem);
  margin: 0 0 4px;
}
.id-head p { color: var(--color-muted); margin: 0; font-size: 12px; }

/* ── Mapa ── */
.map-wrapper {
  position: relative;
  border: 2px solid var(--color-border);
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 16px;
  background: #1a2a1e;
  transition: border-color .2s;
}
.map-wrapper:hover { border-color: var(--color-primary); }

#sat-map {
  height: 320px;
  width: 100%;
}
@media (max-width: 480px) { #sat-map { height: 250px; } }
@media (min-width: 1024px) { #sat-map { height: 420px; } }

/* ── Pesquisa ── */
.map-search {
  position: absolute;
  top: 10px;
  left: 54px;
  right: 10px;
  z-index: 1000;
  max-width: 100%;
}
@media (min-width: 540px) {
  .map-search {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    max-width: 300px;
    width: min(300px, calc(100% - 180px));
  }
}
@media (min-width: 1024px) {
  .map-search {
    max-width: 340px;
    width: min(340px, calc(100% - 200px));
  }
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 10px;
  padding: 8px 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.22);
  transition: border-color .15s, box-shadow .15s;
}
.search-input-wrap:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 2px 10px rgba(0,0,0,0.22), 0 0 0 3px rgba(31,111,67,.15);
}

.search-icon { color: #666; flex-shrink: 0; }
.search-spinner { color: var(--color-primary); flex-shrink: 0; }

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-family: var(--font-body);
  font-size: 13px;
  color: #1b2a1f;
  background: transparent;
  min-width: 0;
}
.search-input::placeholder { color: #999; }

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  padding: 0;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  line-height: 1;
}
.search-clear:hover { color: var(--color-ink); }

.search-results {
  list-style: none;
  margin: 4px 0 0;
  padding: 4px 0;
  background: rgba(255,255,255,0.98);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.22);
  overflow: hidden;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 500;
}

.search-results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  cursor: pointer;
  transition: background .12s;
}
.search-results li:hover { background: #f0f7f2; }

.result-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}
.result-name {
  font-size: 13px;
  color: #1b2a1f;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-sub {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-type {
  font-size: 10px;
  color: #1f6f43;
  background: #eef4ee;
  padding: 2px 7px;
  border-radius: 999px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid #c5e0c9;
}

/* ── Badge de área ── */
.area-badge {
  position: absolute;
  bottom: 44px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(31,111,67,.9);
  color: white;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 800;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: background .2s;
}
.area-badge.area-warn  { background: rgba(201,123,61,.9); }
.area-badge.area-error { background: rgba(179,58,58,.9); }

/* ── Hints / Botão limpar ── */
.map-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(10, 20, 14, .88);
  color: #c8e6ca;
  font-size: 12px;
  padding: 7px 16px;
  border-radius: 999px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 800;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.btn-clear-map {
  position: absolute;
  top: 10px;
  right: 54px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(255,255,255,0.95);
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  color: var(--color-warn);
  font-size: 12px;
  font-family: var(--font-body);
  font-weight: 500;
  transition: background .15s;
  box-shadow: 0 1px 6px rgba(0,0,0,0.15);
}
.btn-clear-map:hover { background: #fff0f0; }

/* ── Formulário ── */
.sat-form { display: flex; flex-direction: column; gap: 16px; margin-bottom: 12px; }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 400px) { .form-row { grid-template-columns: 1fr; } }

.form-group { display: flex; flex-direction: column; gap: 6px; }

.organ-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.form-hint { font-size: 12px; color: var(--color-muted); margin: 0; line-height: 1.4; }

.organ-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.organ-chips button {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  font-family: var(--font-body);
  transition: .15s;
  min-height: 38px;
  color: var(--color-ink);
}
.organ-chips button.active { background: var(--color-primary); color: white; border-color: transparent; }
.organ-chips button:hover:not(.active) { border-color: var(--color-primary); }

input[type="date"] {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--color-ink);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 9px 12px;
  background: var(--color-surface);
  width: 100%;
  outline: none;
  transition: border-color .15s;
}
input[type="date"]:focus { border-color: var(--color-primary); }
input[type="range"] {
  width: 100%;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.actions { display: flex; gap: 10px; }

.btn-primary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 13px;
  font-weight: 600;
  font-size: 14px;
  font-family: var(--font-body);
  cursor: pointer;
  transition: .15s;
  min-height: 48px;
}
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dk); }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }

.btn-ghost {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 13px 16px;
  cursor: pointer;
  color: var(--color-muted);
  font-size: 14px;
  font-family: var(--font-body);
  white-space: nowrap;
  transition: .15s;
  min-height: 48px;
}
.btn-ghost:hover { border-color: var(--color-primary); color: var(--color-ink); }

.inline-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-warn);
  background: #fff5f5;
  border: 1px solid #f5c2c2;
  border-radius: 8px;
  padding: 9px 12px;
}

.inline-area-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-accent);
  background: #fff9f0;
  border: 1px solid #f5d9b8;
  border-radius: 8px;
  padding: 9px 12px;
}

/* ── Nota Sentinel Hub ── */
.sentinel-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 11.5px;
  color: var(--color-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  line-height: 1.5;
}
.sentinel-note svg { flex-shrink: 0; margin-top: 1px; }

.erro-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--color-warn);
  background: #fff5f5;
  border: 1px solid #f5c2c2;
  border-radius: var(--radius);
  padding: 14px;
  font-size: 13.5px;
  line-height: 1.5;
  margin: 10px 0;
}
.erro-card.inline { margin: 0; }

.rate-limit-inline {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--color-accent);
  background: #fff9f0;
  border: 1px solid #f5d9b8;
  border-radius: 8px;
  padding: 10px 12px;
}

/* ── Resultados ── */
.results { display: flex; flex-direction: column; gap: 10px; margin: 20px 0 16px; }

.results-header {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 4px;
}
.result-date {
  margin-left: auto;
  background: var(--color-primary-lt);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
}

.result-card {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 14px 16px;
  border-left: 4px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result-card.alta  { border-left-color: var(--color-primary); }
.result-card.media { border-left-color: var(--color-accent); }
.result-card.baixa { border-left-color: var(--color-warn); }

.result-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.result-name { font-weight: 700; font-size: 14.5px; }
.result-right { display: flex; align-items: center; gap: 8px; }

.result-index-pill {
  font-family: var(--font-mono);
  font-size: 10.5px;
  background: var(--color-primary-lt);
  color: var(--color-primary);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid #c5e0c9;
}

.result-score {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
}
.result-score.alta  { color: var(--color-primary); }
.result-score.media { color: var(--color-accent); }
.result-score.baixa { color: var(--color-warn); }

.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
@media (max-width: 480px) { .metrics-row { grid-template-columns: repeat(2, 1fr); } }

.metric {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.metric-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--color-muted);
}
.metric-val {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  color: var(--color-ink);
}
.metric-val.primary { color: var(--color-primary); }

.meter-wrap { display: flex; align-items: center; gap: 10px; }
.meter { flex: 1; height: 5px; background: #eee; border-radius: 999px; overflow: hidden; }
.meter-fill { height: 100%; border-radius: 999px; transition: width .5s; }
.meter-label { font-size: 11px; color: var(--color-muted); white-space: nowrap; }

.low-conf-warning {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: var(--color-warn);
  background: #fff9f0;
  border: 1px solid #f5d9b8;
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.4;
}

.result-img-wrap {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  position: relative;
}
.result-img { width: 100%; display: block; max-height: 280px; object-fit: cover; }
.result-img-caption {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(10,20,14,.8); color: #c8e6ca;
  font-size: 11px; text-align: center; padding: 5px; margin: 0;
}

.scale-wrap { display: flex; flex-direction: column; gap: 5px; }
.scale-title {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--color-muted);
}
.scale-bar { display: flex; border-radius: 6px; overflow: hidden; height: 10px; }
.scale-step { flex: 1; }
.scale-labels { display: flex; }
.scale-lbl {
  flex: 1;
  font-size: 9px;
  color: var(--color-muted);
  font-family: var(--font-mono);
  text-align: center;
}

/* ── Explicação ── */
.explanation-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 14px;
}
.explanation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  color: var(--color-primary-dk);
  margin-bottom: 12px;
}
.expl-model-badge {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--color-primary-lt);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 999px;
}
.expl-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-muted);
  font-size: 13px;
}
.explanation-content { line-height: 1.7; white-space: pre-wrap; font-size: 14px; }

.id-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 11.5px;
  color: var(--color-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  line-height: 1.5;
}

.fade-enter-active, .fade-leave-active { transition: opacity .25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.spin { animation: rot 1s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
</style>