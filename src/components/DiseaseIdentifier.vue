<script setup>
import { ref } from "vue";
import {
  Camera, Upload, Loader2, AlertTriangle, RefreshCw,
  Sparkles, Info, ShieldCheck, FlaskConical, Clock
} from "lucide-vue-next";
import { identificarDoenca } from "../services/identify.js";
import { askAssistant } from "../services/chat.js";

const ORGANS = [
  { id: "auto",   label: "Automático" },
  { id: "leaf",   label: "Folha" },
  { id: "flower", label: "Flor" },
  { id: "fruit",  label: "Fruto" },
  { id: "bark",   label: "Tronco/casca" },
];

const ficheiro      = ref(null);
const previewUrl    = ref(null);
const orgao         = ref("auto");
const loading       = ref(false);
const erro          = ref("");
const erroRateLimit = ref(false);
const resultados    = ref([]);
const dadosBrutos   = ref(null);

const explicacao           = ref("");
const explicandoCarregando = ref(false);
const erroExplicacao       = ref("");

function escolherFicheiro(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  // Validar tamanho (máx 10 MB)
  if (file.size > 10 * 1024 * 1024) {
    erro.value = "O ficheiro excede o tamanho máximo de 10 MB. Escolhe uma imagem mais pequena.";
    return;
  }
  ficheiro.value   = file;
  previewUrl.value = URL.createObjectURL(file);
  resultados.value = [];
  dadosBrutos.value = null;
  erro.value = "";
  erroRateLimit.value = false;
  explicacao.value = "";
  erroExplicacao.value = "";
  // Limpar o input para permitir escolher o mesmo ficheiro novamente
  event.target.value = "";
}

function limpar() {
  ficheiro.value   = null;
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
  resultados.value = [];
  dadosBrutos.value = null;
  erro.value = "";
  erroRateLimit.value = false;
  explicacao.value = "";
  erroExplicacao.value = "";
}

async function identificar() {
  if (!ficheiro.value) return;

  loading.value = true;
  erro.value = "";
  erroRateLimit.value = false;
  resultados.value = [];
  explicacao.value = "";
  erroExplicacao.value = "";

  try {
    const data = await identificarDoenca([ficheiro.value], [orgao.value]);

    dadosBrutos.value = data;

    resultados.value = (data?.results ?? []).map((r) => {
      const partes = (r.description || "").split(" - ");
      return {
        nome:      partes[0]?.trim() || "Desconhecido",
        nomeComum: partes[1]?.trim() || null,
        original:  r.description || "",
        codigo:    r.eppoCode || null,
        confianca: Math.round((r.score ?? 0) * 100),
      };
    });

    if (resultados.value.length === 0) {
      erro.value = "Não foi possível identificar com confiança. Tenta com outra foto mais nítida, com iluminação natural e sem sombras.";
    } else {
      explicarResultado(resultados.value[0]);
    }
  } catch (err) {
    if (err.rateLimited) {
      erroRateLimit.value = true;
      erro.value = err.message;
    } else {
      erro.value = err.message || "Erro ao identificar. Verifica a ligação e tenta novamente.";
    }
  }

  loading.value = false;
}

async function explicarResultado(resultado) {
  explicandoCarregando.value = true;
  erroExplicacao.value = "";
  explicacao.value = "";

  try {
    const data = await askAssistant({
      message:  "Explica este resultado e o que devo fazer.",
      category: "pragas",
      diagnosis: {
        description: resultado.original,
        score:       resultado.confianca / 100,
        eppoCode:    resultado.codigo,
      },
    });
    explicacao.value = data.reply || "";
  } catch (err) {
    if (err.rateLimited) {
      erroExplicacao.value = err.message;
    } else {
      erroExplicacao.value =
        "Não foi possível obter a explicação agora. O resultado de identificação acima continua válido.";
    }
  }

  explicandoCarregando.value = false;
}

function nivelConfianca(pct) {
  if (pct >= 60) return "alta";
  if (pct >= 30) return "media";
  return "baixa";
}

function nivelLabel(pct) {
  if (pct >= 60) return "Confiança alta";
  if (pct >= 30) return "Confiança média";
  return "Confiança baixa";
}
</script>

<template>
  <div class="identifier">
    <header class="id-head">
      <div>
        <h2>Identificação fitossanitária</h2>
        <p>PlantNet Identify API · +340 000 espécies · códigos EPPO</p>
      </div>
    </header>

    <!-- Upload zone -->
    <div class="upload-zone" :class="{ 'has-image': previewUrl }">
      <img v-if="previewUrl" :src="previewUrl" alt="Pré-visualização" class="preview" />

      <div v-else class="upload-label">
        <Camera :size="30" class="upload-icon" />
        <span class="upload-title">Foto da planta ou cultura</span>
        <span class="upload-hint">JPG · PNG · WEBP · máx. 10 MB</span>

        <!-- Dois botões: câmara (mobile) + galeria/ficheiro -->
        <div class="upload-options">
          <label class="upload-opt-btn primary-opt">
            <Camera :size="15" />
            <span>Câmara</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              @change="escolherFicheiro"
            />
          </label>
          <label class="upload-opt-btn secondary-opt">
            <Upload :size="15" />
            <span>Galeria / Ficheiro</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              @change="escolherFicheiro"
            />
          </label>
        </div>
      </div>
    </div>

    <template v-if="previewUrl">
      <!-- Órgão -->
      <div class="organ-section">
        <label class="organ-label">Parte da planta fotografada</label>
        <div class="organ-chips">
          <button
            v-for="o in ORGANS"
            :key="o.id"
            :class="{ active: orgao === o.id }"
            @click="orgao = o.id"
          >
            {{ o.label }}
          </button>
        </div>
      </div>

      <!-- Ações -->
      <div class="actions">
        <button class="btn-primary" :disabled="loading" @click="identificar">
          <Loader2 v-if="loading" :size="17" class="spin" />
          <Upload v-else :size="17" />
          {{ loading ? "A analisar imagem..." : "Identificar" }}
        </button>
        <button class="btn-ghost" @click="limpar">
          <RefreshCw :size="15" />
          Nova foto
        </button>
      </div>
    </template>

    <!-- Erro rate limit (PlantNet) -->
    <div v-if="erroRateLimit" class="rate-limit-card">
      <Clock :size="16" />
      <div>
        <div class="rate-limit-title">Limite diário atingido</div>
        <div class="rate-limit-body">{{ erro }}</div>
      </div>
    </div>

    <!-- Erro genérico -->
    <div v-else-if="erro" class="erro-card">
      <AlertTriangle :size="16" />
      <span>{{ erro }}</span>
    </div>

    <!-- Resultados -->
    <div v-if="resultados.length" class="results">
      <div class="results-header">
        <FlaskConical :size="14" />
        <span>Resultados da análise fitossanitária</span>
      </div>

      <div
        v-for="(r, i) in resultados"
        :key="i"
        class="result-card"
        :class="nivelConfianca(r.confianca)"
      >
        <div class="result-top">
          <span class="result-name">{{ r.nome }}</span>
          <div class="result-right">
            <span v-if="r.codigo" class="result-eppo">{{ r.codigo }}</span>
            <span class="result-score" :class="nivelConfianca(r.confianca)">
              {{ r.confianca }}%
            </span>
          </div>
        </div>

        <div v-if="r.nomeComum" class="result-common">{{ r.nomeComum }}</div>

        <div class="meter-wrap">
          <div class="meter">
            <div class="meter-fill" :style="{ width: r.confianca + '%' }" />
          </div>
          <span class="meter-label">{{ nivelLabel(r.confianca) }}</span>
        </div>

        <div v-if="r.confianca < 40" class="low-conf-warning">
          <Info :size="12" />
          Confiança abaixo de 40% — confirma com técnico fitossanitário ou DGAV antes de qualquer tratamento.
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
        <span>Explicação e conselho técnico</span>
        <span class="expl-model-badge">Groq · Workers AI</span>
      </div>

      <div v-if="explicandoCarregando" class="expl-loading">
        <Loader2 :size="14" class="spin" />
        <span>A traduzir resultado e a preparar conselho fitossanitário...</span>
      </div>

      <div v-else-if="erroExplicacao" class="erro-card inline">
        <AlertTriangle :size="14" />
        <span>{{ erroExplicacao }}</span>
      </div>

      <div v-else class="explanation-content">{{ explicacao }}</div>
    </div>

    <!-- Disclaimer -->
    <div v-if="resultados.length" class="id-disclaimer">
      <ShieldCheck :size="12" />
      <span>
        Identificação automática por IA — não substitui diagnóstico por técnico habilitado.
        Antes de qualquer tratamento fitossanitário confirma com DGAV ou Engenheiro Agrónomo.
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

/* ── Upload zone ── */
.upload-zone {
  border: 2px dashed var(--color-border);
  border-radius: 18px;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  overflow: hidden;
  margin-bottom: 16px;
  transition: border-color .2s;
}
.upload-zone:hover { border-color: var(--color-primary); }
.upload-zone.has-image { border-style: solid; padding: 0; min-height: 0; }

.preview {
  width: 100%;
  max-height: 300px;
  object-fit: cover;
  display: block;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
  padding: 32px 20px;
  width: 100%;
}
.upload-icon  { flex-shrink: 0; }
.upload-title { font-weight: 600; font-size: 15px; color: var(--color-ink); }
.upload-hint  { font-size: 12px; color: var(--color-muted); }

/* ── Dois botões de upload ── */
.upload-options {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.upload-opt-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: .15s;
  min-height: 44px;
  white-space: nowrap;
}

.primary-opt {
  background: var(--color-primary);
  color: white;
  border: 1px solid transparent;
}
.primary-opt:hover { background: var(--color-primary-dk); }

.secondary-opt {
  background: var(--color-surface);
  color: var(--color-ink);
  border: 1px solid var(--color-border);
}
.secondary-opt:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* ── Órgão ── */
.organ-section { margin-bottom: 14px; }
.organ-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.organ-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.organ-chips button {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  transition: .15s;
  min-height: 38px;
  font-family: var(--font-body);
}
.organ-chips button.active  { background: var(--color-primary); color: white; border-color: transparent; }
.organ-chips button:hover:not(.active) { border-color: var(--color-primary); }

/* ── Ações ── */
.actions { display: flex; gap: 10px; margin-bottom: 16px; }

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
  cursor: pointer;
  transition: .15s;
  min-height: 48px;
  font-family: var(--font-body);
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
  white-space: nowrap;
  transition: .15s;
  min-height: 48px;
  font-family: var(--font-body);
}
.btn-ghost:hover { border-color: var(--color-primary); color: var(--color-ink); }

/* ── Rate limit ── */
.rate-limit-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff9f0;
  border: 1px solid #f5d9b8;
  border-radius: var(--radius);
  padding: 14px;
  margin: 10px 0;
  color: var(--color-accent);
}
.rate-limit-title { font-weight: 600; font-size: 13px; margin-bottom: 3px; }
.rate-limit-body  { font-size: 13px; color: var(--color-ink); line-height: 1.5; }

/* ── Erro ── */
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

.result-card {
  background: var(--color-surface);
  border-radius: var(--radius);
  padding: 14px 16px;
  border-left: 4px solid var(--color-border);
}
.result-card.alta   { border-left-color: var(--color-primary); }
.result-card.media  { border-left-color: var(--color-accent); }
.result-card.baixa  { border-left-color: var(--color-warn); }

.result-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}
.result-name  { font-weight: 700; font-style: italic; font-size: 14.5px; }
.result-right { display: flex; align-items: center; gap: 8px; }
.result-eppo  {
  font-family: var(--font-mono);
  font-size: 10.5px;
  background: var(--color-primary-lt);
  color: var(--color-primary);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid #c5e0c9;
}
.result-score { font-family: var(--font-mono); font-size: 14px; font-weight: 600; }
.result-score.alta  { color: var(--color-primary); }
.result-score.media { color: var(--color-accent); }
.result-score.baixa { color: var(--color-warn); }

.result-common { font-size: 12.5px; color: var(--color-muted); margin-bottom: 10px; }

.meter-wrap { display: flex; align-items: center; gap: 10px; }
.meter { flex: 1; height: 5px; background: #eee; border-radius: 999px; overflow: hidden; }
.meter-fill { height: 100%; background: var(--color-primary); border-radius: 999px; transition: width .5s; }
.result-card.media .meter-fill { background: var(--color-accent); }
.result-card.baixa .meter-fill { background: var(--color-warn); }
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
  margin-top: 10px;
  line-height: 1.4;
}

/* ── Explicação LLM ── */
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
.explanation-content {
  line-height: 1.7;
  white-space: pre-wrap;
  font-size: 14px;
}

/* ── Disclaimer ── */
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

.spin { animation: rot 1s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
</style>