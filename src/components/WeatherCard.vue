<script setup>
import { ref, onMounted, computed } from "vue";
import {
  MapPin, RefreshCw, Thermometer, Droplets, Wind, Sun,
  Cloud, CloudRain, CloudDrizzle, CloudFog, CloudSnow,
  CloudLightning, CloudSun, Snowflake, Search, Gauge,
  MessageSquareText, Send, Loader2, ChevronDown, X
} from "lucide-vue-next";
import { getZonas, getPrevisao, getZonaSalva, salvarZona, WEATHER_TYPES } from "../services/weather.js";
import { askAssistant } from "../services/chat.js";

// ── Estado ──────────────────────────────────────────────────
const zonas        = ref([]);
const zonaAtual    = ref(null);
const previsoes    = ref([]);
const loading      = ref(false);
const loadingZonas = ref(true);
const erro         = ref("");
const filtroZona   = ref("");
const mostrarPicker = ref(false);

// Q&A baseada no tempo
const perguntaMeteo    = ref("");
const respostaMeteo    = ref("");
const loadingPergunta  = ref(false);

const ICON_MAP = {
  Sun, Cloud, CloudSun, CloudRain, CloudDrizzle,
  CloudFog, CloudSnow, CloudLightning, Snowflake,
  CloudRainWind: CloudRain, CloudHail: CloudRain,
};
function getIcon(name) { return ICON_MAP[name] || Cloud; }

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function labelDia(i, dateStr) {
  if (i === 0) return "Hoje";
  if (i === 1) return "Amanhã";
  if (dateStr) { const d = new Date(dateStr); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; }
  return `+${i}d`;
}

function tempGrad(tMin, tMax) {
  const lo = Math.max(0, Math.min(100, ((tMin ?? 0) / 40) * 100));
  const hi = Math.max(0, Math.min(100, ((tMax ?? 20) / 40) * 100));
  return { left: lo + "%", width: (hi - lo) + "%" };
}

function chuvaClass(pct) {
  if (pct >= 70) return "chuva-alta";
  if (pct >= 40) return "chuva-med";
  return "";
}

function uvInfo(uv) {
  if (uv == null) return null;
  if (uv <= 2)  return { label: "Baixo",     cls: "uv-baixo" };
  if (uv <= 5)  return { label: "Moderado",  cls: "uv-mod" };
  if (uv <= 7)  return { label: "Alto",      cls: "uv-alto" };
  if (uv <= 10) return { label: "Muito alto",cls: "uv-muito" };
  return { label: "Extremo", cls: "uv-ext" };
}

// Avaliação agronómica (dia 0)
const hoje = computed(() => previsoes.value[0] ?? null);
const agronomia = computed(() => {
  const h = hoje.value;
  if (!h) return null;
  return {
    geada:    h.tMin <= 2 ? "warn" : h.tMin <= 6 ? "med" : "ok",
    geadaLabel: h.tMin <= 2 ? "⚠ Risco elevado" : h.tMin <= 6 ? "Risco baixo" : "Sem risco",
    trat:     h.chuva < 40 ? "ok" : "warn",
    tratLabel: h.chuva < 40 ? "Favorável" : "Desfavorável (chuva)",
    rega:     h.chuva >= 60 ? "ok" : h.tMax >= 28 ? "warn" : "med",
    regaLabel: h.chuva >= 60 ? "Dispensar" : h.tMax >= 28 ? "Aumentar" : "Normal",
    stress:   h.tMax >= 35 ? "warn" : h.tMax >= 28 ? "med" : "ok",
    stressLabel: h.tMax >= 35 ? "⚠ Stresse elevado" : h.tMax >= 28 ? "Moderado" : "Normal",
  };
});

// Quick questions baseadas no estado do tempo
const quickQuestions = computed(() => {
  const h = hoje.value;
  if (!h) return [];
  const qs = [
    "É bom dia para aplicar fungicidas ou pesticidas?",
    "Devo regar hoje ou posso adiar?",
  ];
  if (h.tMin <= 4) qs.push("Há risco de geada? O que devo proteger?");
  if (h.chuva >= 60) qs.push("Com esta chuva prevista, o que devo adiantar no campo?");
  if (h.tMax >= 32) qs.push("Com estas temperaturas, que cuidados tenho com as culturas?");
  if (h.uv >= 7) qs.push("O índice UV é elevado — há impacto nas culturas ou nos tratamentos?");
  qs.push("Com este tempo, qual a melhor tarefa para fazer hoje?");
  return qs.slice(0, 4);
});

// Zonas filtradas para o picker
const zonasFiltradas = computed(() => {
  const f = filtroZona.value.toLowerCase().trim();
  if (!f) return zonas.value;
  return zonas.value.filter(z => z.nome.toLowerCase().includes(f));
});

// ── Acções ──────────────────────────────────────────────────
async function carregarZonas() {
  loadingZonas.value = true;
  try {
    zonas.value = await getZonas();
    // Restaura zona salva ou usa Évora como default
    const saved = getZonaSalva();
    const defaultZone = zonas.value.find(z => z.id === 1070500) ?? zonas.value[0];
    const zona = saved ? zonas.value.find(z => z.id === saved.id) ?? defaultZone : defaultZone;
    await seleccionarZona(zona);
  } catch (e) {
    erro.value = e.message;
  }
  loadingZonas.value = false;
}

async function seleccionarZona(zona) {
  if (!zona) return;
  zonaAtual.value = zona;
  salvarZona(zona);
  mostrarPicker.value = false;
  filtroZona.value = "";
  await carregarPrevisao();
}

async function carregarPrevisao() {
  if (!zonaAtual.value) return;
  loading.value = true;
  erro.value = "";
  respostaMeteo.value = "";
  try {
    previsoes.value = await getPrevisao(zonaAtual.value.id);
  } catch (e) {
    erro.value = e.message;
  }
  loading.value = false;
}

async function perguntarSobreTempo(pergunta) {
  if (!hoje.value) return;
  perguntaMeteo.value = pergunta;
  loadingPergunta.value = true;
  respostaMeteo.value = "";

  try {
    const data = await askAssistant({
      message: pergunta,
      category: "clima",
      weatherData: {
        nomeLocal: zonaAtual.value?.nome,
        estado:    hoje.value.estado,
        tMin:      hoje.value.tMin,
        tMax:      hoje.value.tMax,
        chuva:     hoje.value.chuva,
        vento:     hoje.value.ventoLabel ?? hoje.value.vento,
        uv:        hoje.value.uv,
      },
    });
    respostaMeteo.value = data.reply || "";
  } catch {
    respostaMeteo.value = "Não foi possível obter uma resposta agora.";
  }
  loadingPergunta.value = false;
}

onMounted(carregarZonas);
</script>

<template>
  <div class="weather">
    <header class="weather-head">
      <div>
        <h2>Previsão meteorológica</h2>
        <p>Dados IPMA em tempo real · selecciona a tua zona</p>
      </div>
      <button class="refresh-btn" @click="carregarPrevisao" :disabled="loading || loadingZonas" title="Actualizar">
        <RefreshCw :size="15" :class="{ spin: loading }" />
      </button>
    </header>

    <!-- ── Selector de zona ── -->
    <div class="zone-selector">
      <button class="zone-btn" @click="mostrarPicker = !mostrarPicker" :disabled="loadingZonas">
        <MapPin :size="14" />
        <span>{{ zonaAtual?.nome ?? (loadingZonas ? "A carregar zonas..." : "Escolhe uma zona") }}</span>
        <ChevronDown :size="14" :class="{ rotated: mostrarPicker }" />
      </button>

      <div v-if="mostrarPicker" class="zone-picker">
        <div class="picker-search">
          <Search :size="13" />
          <input
            v-model="filtroZona"
            placeholder="Pesquisar zona..."
            autofocus
          />
          <button v-if="filtroZona" @click="filtroZona = ''" class="clear-search"><X :size="12" /></button>
        </div>
        <div class="picker-list">
          <button
            v-for="z in zonasFiltradas"
            :key="z.id"
            class="picker-item"
            :class="{ active: zonaAtual?.id === z.id }"
            @click="seleccionarZona(z)"
          >
            {{ z.nome }}
          </button>
          <div v-if="!zonasFiltradas.length" class="picker-empty">Nenhuma zona encontrada</div>
        </div>
      </div>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="skeleton-wrap">
      <div class="skeleton hero-skel" />
      <div class="sk-row">
        <div v-for="i in 5" :key="i" class="skeleton day-skel" />
      </div>
    </div>

    <!-- ── Erro ── -->
    <div v-else-if="erro" class="erro-card">{{ erro }}</div>

    <!-- ── Dados ── -->
    <template v-else-if="previsoes.length && hoje">
      <!-- Hero hoje -->
      <div class="hero-card">
        <div class="hero-left">
          <component :is="getIcon(hoje.icone)" :size="52" class="hero-icon" />
          <div class="hero-estado">{{ hoje.estado }}</div>
        </div>
        <div class="hero-right">
          <div class="hero-temps">
            <span class="t-max">{{ hoje.tMax }}°</span>
            <span class="t-sep">/</span>
            <span class="t-min">{{ hoje.tMin }}°C</span>
          </div>
          <div class="hero-meta">
            <div class="meta-pill" :class="chuvaClass(hoje.chuva)">
              <Droplets :size="13" /> {{ hoje.chuva }}% precip.
            </div>
            <div class="meta-pill">
              <Wind :size="13" /> {{ hoje.ventoLabel ?? hoje.vento }}
              <template v-if="hoje.classeVentoLabel"> · {{ hoje.classeVentoLabel }}</template>
            </div>
            <div v-if="hoje.uv != null" class="meta-pill" :class="uvInfo(hoje.uv)?.cls">
              <Sun :size="13" /> UV {{ hoje.uv }} · {{ uvInfo(hoje.uv)?.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- Previsão 5 dias -->
      <div class="forecast-grid">
        <div
          v-for="(p, i) in previsoes"
          :key="i"
          class="fc-card"
          :class="{ hoje: i === 0 }"
        >
          <div class="fc-dia">{{ labelDia(i, p.dataPrevisao) }}</div>
          <component :is="getIcon(p.icone)" :size="20" class="fc-icon" />
          <div class="fc-temps">
            <span class="fc-max">{{ p.tMax }}°</span>
            <span class="fc-min">{{ p.tMin }}°</span>
          </div>
          <div class="fc-bar">
            <div class="fc-bar-fill" :style="tempGrad(p.tMin, p.tMax)" />
          </div>
          <div class="fc-chuva" :class="chuvaClass(p.chuva)">
            <Droplets :size="10" /> {{ p.chuva }}%
          </div>
        </div>
      </div>

      <!-- Leitura agronómica -->
      <div class="agri-box" v-if="agronomia">
        <div class="agri-title"><Gauge :size="13" /> Leitura agronómica</div>
        <div class="agri-grid">
          <div class="agri-item">
            <span class="agri-label">Risco de geada</span>
            <span class="agri-val" :class="agronomia.geada">{{ agronomia.geadaLabel }}</span>
          </div>
          <div class="agri-item">
            <span class="agri-label">Janela de tratamento</span>
            <span class="agri-val" :class="agronomia.trat">{{ agronomia.tratLabel }}</span>
          </div>
          <div class="agri-item">
            <span class="agri-label">Rega</span>
            <span class="agri-val" :class="agronomia.rega">{{ agronomia.regaLabel }}</span>
          </div>
          <div class="agri-item">
            <span class="agri-label">Stresse térmico</span>
            <span class="agri-val" :class="agronomia.stress">{{ agronomia.stressLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Q&A contextual -->
      <div class="qa-box">
        <div class="qa-title">
          <MessageSquareText :size="13" />
          Pergunta sobre este tempo
        </div>
        <div class="quick-qs">
          <button
            v-for="q in quickQuestions"
            :key="q"
            class="quick-q"
            :class="{ active: perguntaMeteo === q }"
            @click="perguntarSobreTempo(q)"
            :disabled="loadingPergunta"
          >
            {{ q }}
          </button>
        </div>

        <!-- Input livre -->
        <div class="qa-input-wrap">
          <input
            v-model="perguntaMeteo"
            placeholder="Escreve a tua própria pergunta..."
            @keydown.enter="perguntarSobreTempo(perguntaMeteo)"
            :disabled="loadingPergunta"
          />
          <button
            class="qa-send"
            @click="perguntarSobreTempo(perguntaMeteo)"
            :disabled="!perguntaMeteo.trim() || loadingPergunta"
          >
            <Loader2 v-if="loadingPergunta" :size="15" class="spin" />
            <Send v-else :size="15" />
          </button>
        </div>

        <!-- Resposta -->
        <div v-if="loadingPergunta" class="qa-loading">
          <Loader2 :size="13" class="spin" /> A consultar o assistente...
        </div>
        <div v-else-if="respostaMeteo" class="qa-resposta">
          {{ respostaMeteo }}
        </div>
      </div>

      <div class="weather-foot">
        <span>Fonte: IPMA Open Data · via Worker proxy</span>
        <span>{{ new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.weather { padding: 32px 0 8px; }

.weather-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.weather-head h2 { font-family: var(--font-display); font-size: clamp(1.3rem, 3.5vw, 1.7rem); margin: 0 0 4px; }
.weather-head p  { color: var(--color-muted); font-size: 12px; margin: 0; }

.refresh-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 9px; cursor: pointer; display: flex; color: var(--color-muted); transition: .15s;
}
.refresh-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.refresh-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Zone selector */
.zone-selector { position: relative; margin-bottom: 16px; }

.zone-btn {
  display: flex; align-items: center; gap: 8px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 10px 14px; cursor: pointer; width: 100%;
  font-size: 14px; font-weight: 600; font-family: var(--font-body); transition: .15s;
}
.zone-btn:hover { border-color: var(--color-primary); }
.zone-btn svg:last-child { margin-left: auto; transition: transform .2s; }
.zone-btn svg.rotated { transform: rotate(180deg); }

.zone-picker {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.12);
  z-index: 50; overflow: hidden;
}

.picker-search {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid var(--color-border);
}
.picker-search input {
  flex: 1; border: none; outline: none; font-size: 13px;
  font-family: var(--font-body); background: transparent;
}
.clear-search { background: none; border: none; cursor: pointer; color: var(--color-muted); display: flex; }

.picker-list { max-height: 240px; overflow-y: auto; padding: 6px; }
.picker-item {
  display: block; width: 100%; text-align: left; background: none; border: none;
  border-radius: 8px; padding: 9px 12px; font-size: 13px; cursor: pointer; transition: .12s;
}
.picker-item:hover { background: var(--color-primary-lt); }
.picker-item.active { background: var(--color-primary); color: white; font-weight: 600; }
.picker-empty { text-align: center; padding: 20px; color: var(--color-muted); font-size: 13px; }

/* Skeleton */
.skeleton-wrap { display: flex; flex-direction: column; gap: 12px; }
.skeleton { background: linear-gradient(90deg,#e8e5da 25%,#f1efe6 50%,#e8e5da 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: var(--radius); }
@keyframes shimmer { to { background-position: -200% 0; } }
.hero-skel { height: 136px; }
.sk-row { display: flex; gap: 8px; }
.day-skel { flex: 1; height: 110px; }

/* Erro */
.erro-card { background: #fff5f5; border: 1px solid #f5c2c2; color: var(--color-warn); border-radius: var(--radius); padding: 14px; font-size: 13.5px; }

/* Hero */
.hero-card {
  display: flex; gap: 20px; align-items: center;
  background: linear-gradient(135deg, var(--color-primary-dk), var(--color-primary));
  color: white; border-radius: 18px; padding: 22px 20px; margin-bottom: 14px;
}
.hero-left { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.hero-icon { opacity: .9; }
.hero-estado { font-size: 11px; text-align: center; opacity: .75; max-width: 78px; }
.hero-right { flex: 1; }
.hero-temps { display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px; }
.t-max { font-family: var(--font-display); font-size: 3rem; line-height: 1; }
.t-sep { font-size: 1.4rem; opacity: .4; }
.t-min { font-size: 1.1rem; opacity: .65; }
.hero-meta { display: flex; flex-direction: column; gap: 5px; }
.meta-pill { display: flex; align-items: center; gap: 5px; font-size: 12.5px; opacity: .9; }
.chuva-alta { color: #7dd3fc !important; }
.chuva-med  { color: #bae6fd !important; }
.uv-alto,.uv-muito,.uv-ext { color: #fcd34d !important; }

/* Forecast */
.forecast-grid {
  display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-bottom: 14px;
}
@media (max-width: 400px) { .forecast-grid { grid-template-columns: repeat(3,1fr); } }

.fc-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 11px 7px; display: flex; flex-direction: column;
  align-items: center; gap: 5px; text-align: center; transition: border-color .15s;
}
.fc-card.hoje { border-color: var(--color-primary); }
.fc-dia  { font-size: 10.5px; font-weight: 600; color: var(--color-muted); }
.fc-icon { color: var(--color-primary); }
.fc-temps { display: flex; gap: 3px; font-size: 12.5px; }
.fc-max { font-weight: 700; }
.fc-min { color: var(--color-muted); }
.fc-bar { width: 100%; height: 4px; background: #e8e5da; border-radius: 999px; position: relative; overflow: hidden; }
.fc-bar-fill { position: absolute; top:0; height: 100%; background: linear-gradient(90deg,#60c878,#f59e0b); border-radius: 999px; }
.fc-chuva { display: flex; align-items: center; gap: 2px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-muted); }
.fc-chuva.chuva-alta { color: #0369a1; }
.fc-chuva.chuva-med  { color: #0284c7; }

/* Agri box */
.agri-box { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 14px; }
.agri-title { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; }
.agri-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.agri-item { display: flex; flex-direction: column; gap: 2px; }
.agri-label { font-size: 11px; color: var(--color-muted); }
.agri-val   { font-size: 13px; font-weight: 600; }
.agri-val.ok   { color: var(--color-primary); }
.agri-val.med  { color: var(--color-accent); }
.agri-val.warn { color: var(--color-warn); }

/* Q&A */
.qa-box { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 16px; margin-bottom: 14px; }
.qa-title { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; }

.quick-qs { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
.quick-q {
  border: 1px solid var(--color-border); background: var(--color-bg);
  border-radius: 999px; padding: 7px 12px; font-size: 12.5px; cursor: pointer;
  transition: .15s; text-align: left; min-height: 36px;
}
.quick-q:hover { border-color: var(--color-primary); color: var(--color-primary); }
.quick-q.active { background: var(--color-primary); color: white; border-color: transparent; }
.quick-q:disabled { opacity: .5; cursor: not-allowed; }

.qa-input-wrap {
  display: flex; gap: 8px; background: var(--color-bg);
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 6px 6px 6px 12px; transition: border-color .15s; margin-bottom: 10px;
}
.qa-input-wrap:focus-within { border-color: var(--color-primary); }
.qa-input-wrap input {
  flex: 1; border: none; outline: none; font-size: 13.5px;
  background: transparent; font-family: var(--font-body);
}
.qa-input-wrap input:disabled { opacity: .6; }
.qa-send {
  width: 34px; height: 34px; border-radius: 8px; border: none;
  background: var(--color-primary); color: white; display: flex;
  align-items: center; justify-content: center; cursor: pointer; transition: .15s; flex-shrink: 0;
}
.qa-send:disabled { opacity: .4; cursor: not-allowed; }

.qa-loading { display: flex; align-items: center; gap: 7px; color: var(--color-muted); font-size: 13px; }
.qa-resposta { font-size: 14px; line-height: 1.7; white-space: pre-wrap; padding-top: 4px; }

.weather-foot { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-muted); }

.spin { animation: rot 1s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
</style>