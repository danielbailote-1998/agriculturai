<script setup>
import {
  Camera, CloudSun, MessageSquareText, ArrowRight,
  Zap, Shield, Globe, Github, GraduationCap, Code2
} from "lucide-vue-next";

const emit = defineEmits(["navigate"]);

const cards = [
  {
    id: "identificar",
    icon: Camera,
    title: "Identificação fitossanitária",
    description: "Submete uma imagem de folha, fruto ou tronco. Análise por IA via PlantNet com código EPPO e conselho técnico traduzido.",
    tag: "PlantNet + LLM"
  },
  {
    id: "tempo",
    icon: CloudSun,
    title: "Previsão meteorológica",
    description: "Dados reais do IPMA para os próximos 5 dias. Temperatura, precipitação, vento e índice UV — sem LLM, sem invenções.",
    tag: "IPMA direto"
  },
  {
    id: "chat",
    icon: MessageSquareText,
    title: "Assistente técnico agrícola",
    description: "Culturas, solos, fitossanidade, apoios IFAP, fertirrigação, calendário agrícola. Conversação multi-turno com contexto.",
    tag: "Groq · Workers AI"
  }
];

const stack = [
  { label: "Groq LLaMA 3.1 8B",      detalhe: "Inferência <1s · gratuito" },
  { label: "Cloudflare Workers AI",   detalhe: "Fallback automático · gratuito" },
  { label: "PlantNet Identify API",   detalhe: "Fitossanidade · +340k espécies" },
  { label: "IPMA Open Data",          detalhe: "Meteorologia real Portugal · gratuito" },
];
</script>

<template>
  <div class="home">
    <header class="home-head">
      <div class="home-badge">Assistente Técnico</div>
      <h1>O que precisas hoje?</h1>
      <p class="home-sub">
        Ferramentas de IA aplicadas à agricultura portuguesa — sem subscrições,
        sem custos, com fontes verificáveis.
      </p>
    </header>

    <!-- Cards de navegação -->
    <div class="cards">
      <button
        v-for="c in cards"
        :key="c.id"
        class="home-card"
        @click="emit('navigate', c.id)"
      >
        <span class="card-icon">
          <component :is="c.icon" :size="24" />
        </span>
        <span class="card-text">
          <span class="card-title">{{ c.title }}</span>
          <span class="card-desc">{{ c.description }}</span>
          <span class="card-tag">{{ c.tag }}</span>
        </span>
        <ArrowRight :size="18" class="card-arrow" />
      </button>
    </div>

    <!-- Stack técnica -->
    <section class="stack-section">
      <h2 class="stack-title">
        <Zap :size="14" />
        Infraestrutura técnica
      </h2>
      <div class="stack-grid">
        <div v-for="s in stack" :key="s.label" class="stack-item">
          <div class="stack-dot" />
          <div>
            <div class="stack-label">{{ s.label }}</div>
            <div class="stack-detalhe">{{ s.detalhe }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Disclaimers legais -->
    <section class="disclaimers">
      <div class="disclaimer-row">
        <Shield :size="13" />
        <span>
          Valores de fertilização, doses fitossanitárias e montantes IFAP são
          orientações. Confirma sempre com técnico habilitado ou DGAV/IFAP antes
          de qualquer aplicação ou candidatura.
        </span>
      </div>
      <div class="disclaimer-row">
        <Globe :size="13" />
        <span>
          Dados meteorológicos fornecidos diretamente pela API pública IPMA.
          Identificação fitossanitária via PlantNet (INRAE / CIRAD).
        </span>
      </div>
    </section>

    <!-- ── Sobre o autor ── -->
    <section class="about-section">
      <div class="about-inner">
        <div class="about-avatar">DB</div>
        <div class="about-text">
          <div class="about-name">Daniel Bailote</div>
          <div class="about-role">Engenheiro Agrónomo · Programador </div>
          <p class="about-desc">
            Construí a Agriculturai para juntar o que aprendi no campo com o que
            aprendo a programar. Mestre em Engenharia Agronómica pela Universidade
            de Évora, com investigação aplicada ao solo e ao Montado — agora a
            escrever código que torna esse conhecimento acessível a quem trabalha
            a terra.
          </p>
          <div class="about-links">
            <a
              href="https://github.com/danielbailote-1998"
              target="_blank"
              rel="noopener"
              class="about-link"
            >
              <Github :size="13" />
              github.com/danielbailote-1998
            </a>
            <a
              href="mailto:danielbailotedev@gmail.com"
              class="about-link"
            >
              danielbailotedev@gmail.com
            </a>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.home { padding: 32px 0 8px; }

/* ── Header ── */
.home-head { margin-bottom: 28px; }

.home-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-primary);
  background: var(--color-primary-lt);
  border: 1px solid #c5e0c9;
  padding: 3px 10px;
  border-radius: 999px;
  margin-bottom: 10px;
  letter-spacing: .04em;
}

.home-head h1 {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 4vw, 2.1rem);
  margin: 0 0 8px;
  line-height: 1.2;
}

.home-sub {
  color: var(--color-muted);
  margin: 0;
  line-height: 1.6;
  font-size: 14px;
  max-width: 520px;
}

/* ── Cards ── */
.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 32px;
}
@media (min-width: 640px) { .cards { gap: 12px; } }

.home-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s, transform .15s;
  box-shadow: 0 2px 10px rgba(0,0,0,.04);
}
.home-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 4px 20px rgba(31,111,67,.1);
  transform: translateY(-1px);
}
.home-card:active { transform: scale(.99); }

.card-icon {
  flex-shrink: 0;
  width: 46px; height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-lt);
  color: var(--color-primary);
}

.card-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.card-title { font-weight: 600; font-size: 15px; }
.card-desc  { font-size: 13px; color: var(--color-muted); line-height: 1.5; }
.card-tag {
  display: inline-block;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-accent);
  background: #fef4eb;
  border: 1px solid #f5d9b8;
  padding: 2px 8px;
  border-radius: 999px;
}
.card-arrow { color: var(--color-border); flex-shrink: 0; margin-top: 4px; }

/* ── Stack ── */
.stack-section { margin-bottom: 24px; }

.stack-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 0 0 12px;
}

.stack-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
@media (min-width: 640px) {
  .stack-grid { grid-template-columns: repeat(4, 1fr); }
}

.stack-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
}
.stack-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  margin-top: 5px;
  flex-shrink: 0;
}
.stack-label  { font-size: 12px; font-weight: 600; }
.stack-detalhe { font-size: 11px; color: var(--color-muted); margin-top: 2px; }

/* ── Disclaimers ── */
.disclaimers { display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; }

.disclaimer-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11.5px;
  color: var(--color-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.5;
}
.disclaimer-row svg { flex-shrink: 0; margin-top: 1px; }

/* ── Sobre o autor ── */
.about-section {
  border-top: 1px solid var(--color-border);
  padding-top: 28px;
  margin-bottom: 8px;
}

.about-inner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.about-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}

.about-text { flex: 1; min-width: 0; }

.about-name {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.about-role {
  font-size: 12px;
  color: var(--color-primary);
  margin-bottom: 8px;
  font-weight: 500;
}

.about-desc {
  font-size: 13px;
  color: var(--color-muted);
  line-height: 1.65;
  margin: 0 0 12px;
}

.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.about-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-muted);
  text-decoration: none;
  transition: color .15s;
}
.about-link:hover { color: var(--color-primary); }

/* Mobile: avatar em cima do texto quando espaço é curto */
@media (max-width: 400px) {
  .about-inner { flex-direction: column; }
  .about-avatar { width: 40px; height: 40px; font-size: 13px; }
}
</style>