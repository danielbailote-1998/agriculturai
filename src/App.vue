<script setup>
import { ref } from "vue";
import HomeScreen from "./components/HomeScreen.vue";
import WeatherCard from "./components/WeatherCard.vue";
import DiseaseIdentifier from "./components/DiseaseIdentifier.vue";
import ChatAssistant from "./components/ChatAssistant.vue";
import SatelliteMap from "./components/SatelliteMap.vue";
import { Home, Camera, CloudSun, MessageSquareText, Satellite, Sprout } from "lucide-vue-next";

const activeView = ref("home");

const tabs = [
  { id: "home",        label: "Início",      icon: Home },
  { id: "identificar", label: "Identificar", icon: Camera },
  { id: "satelite",    label: "Satélite",    icon: Satellite },
  { id: "tempo",       label: "Tempo",       icon: CloudSun },
  { id: "chat",        label: "Perguntar",   icon: MessageSquareText },
];

const isChat = () => activeView.value === "chat";
</script>

<template>
  <div class="app-shell">

    <!-- ── Sidebar (≥ 1024 px) ── -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <Sprout :size="22" class="brand-icon" />
        <div>
          <div class="brand-name">Agriculturai</div>
          <div class="brand-sub">Assistente técnico agrícola</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="t in tabs" :key="t.id"
          :class="{ active: activeView === t.id }"
          @click="activeView = t.id"
        >
          <component :is="t.icon" :size="18" />
          <span>{{ t.label }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="tech-row">
          <span class="tech-pill">Groq LLaMA 3.1</span>
          <span class="tech-pill">Workers AI</span>
        </div>
        <div class="tech-row">
          <span class="tech-pill">IPMA</span>
          <span class="tech-pill">PlantNet</span>
          <span class="tech-pill">Sentinel-2</span>
        </div>
        <div class="tech-row">
          <span class="tech-pill free-pill">100% Gratuito</span>
        </div>
        <p class="sidebar-legal">
          Dados IPMA em tempo real · Identificação fitossanitária via PlantNet ·
          LLM via Groq com fallback Cloudflare Workers AI ·
          Índices satelitais Sentinel Hub
        </p>
      </div>
    </aside>

    <!-- ── Main ── -->
    <main class="main-content">

      <!-- Top bar tablet (768–1023 px) -->
      <header class="top-bar">
        <div class="top-brand"><Sprout :size="18" /><span>Agriculturai</span></div>
        <nav class="top-nav">
          <button
            v-for="t in tabs" :key="t.id"
            :class="{ active: activeView === t.id }"
            @click="activeView = t.id"
          >
            <component :is="t.icon" :size="15" />{{ t.label }}
          </button>
        </nav>
      </header>

      <!-- Páginas com scroll normal -->
      <div v-show="!isChat()" class="scroll-pages">
        <div class="page-wrap">
          <HomeScreen        v-if="activeView === 'home'"        @navigate="activeView = $event" />
          <DiseaseIdentifier v-else-if="activeView === 'identificar'" />
          <SatelliteMap      v-else-if="activeView === 'satelite'" />
          <WeatherCard       v-else-if="activeView === 'tempo'" />
        </div>
      </div>

      <!-- Chat: contentor dedicado, sem scroll externo -->
      <div v-show="isChat()" class="chat-container">
        <div class="chat-inner">
          <ChatAssistant />
        </div>
      </div>

    </main>

    <!-- ── Bottom nav (≤ 767 px) ── -->
    <nav class="bottom-nav">
      <button
        v-for="t in tabs" :key="t.id"
        :class="{ active: activeView === t.id }"
        @click="activeView = t.id"
      >
        <component :is="t.icon" :size="20" />
        <span>{{ t.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

:root {
  --color-bg:         #f1efe6;
  --color-surface:    #ffffff;
  --color-ink:        #1b2a1f;
  --color-muted:      #6b6a5c;
  --color-primary:    #1f6f43;
  --color-primary-dk: #163f2a;
  --color-primary-lt: #eef4ee;
  --color-accent:     #c97b3d;
  --color-warn:       #b33a3a;
  --color-ok:         #1f6f43;
  --color-border:     #ddd8c7;
  --color-sidebar:    #141f18;
  --font-display:     "Fraunces", Georgia, serif;
  --font-body:        "Inter", Arial, sans-serif;
  --font-mono:        "IBM Plex Mono", monospace;
  --sidebar-w:        240px;
  --nav-h:            64px;
  --topbar-h:         53px;
  --radius:           14px;
}

*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  height: 100%; background: var(--color-bg);
  color: var(--color-ink); font-family: var(--font-body);
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}
#app { height: 100%; }

.app-shell {
  display: flex;
  height: 100dvh;
  overflow: hidden;
}

/* ── Sidebar ── */
.sidebar {
  display: none;
  width: var(--sidebar-w);
  flex-shrink: 0;
  background: var(--color-sidebar);
  color: #d4e8d6;
  flex-direction: column;
  padding: 24px 16px 20px;
  height: 100dvh;
  overflow-y: auto;
}
@media (min-width: 1024px) { .sidebar { display: flex; } }

.sidebar-brand {
  display: flex; align-items: center; gap: 12px;
  padding: 0 4px 24px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  margin-bottom: 20px;
}
.brand-icon { color: #6fcf8a; }
.brand-name { font-family: var(--font-display); font-size: 1.15rem; color: #e8f5ea; }
.brand-sub  { font-size: 11px; color: #6b8a6e; margin-top: 1px; }

.sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sidebar-nav button {
  display: flex; align-items: center; gap: 10px;
  width: 100%; background: none; border: none;
  color: #9ab09d; padding: 10px 12px; border-radius: 10px;
  font-family: var(--font-body); font-size: 14px; font-weight: 500;
  cursor: pointer; transition: .15s; text-align: left;
}
.sidebar-nav button:hover  { background: rgba(255,255,255,.06); color: #d4e8d6; }
.sidebar-nav button.active { background: var(--color-primary); color: #fff; }

.sidebar-footer { margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.06); }
.tech-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.tech-pill {
  background: rgba(255,255,255,.07); color: #8ab090;
  font-family: var(--font-mono); font-size: 10px;
  padding: 3px 8px; border-radius: 999px;
}
.free-pill { background: rgba(31,111,67,.4); color: #7de09e; }
.sidebar-legal { font-size: 10px; color: #4a6150; line-height: 1.5; margin: 10px 0 0; }

/* ── Main ── */
.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  position: relative;
}

/* ── Top bar (tablet 768–1023) ── */
.top-bar {
  display: none; flex-shrink: 0;
  align-items: center; justify-content: space-between;
  padding: 12px 20px;
  background: var(--color-sidebar); color: #d4e8d6;
  height: var(--topbar-h);
  z-index: 20;
}
@media (min-width: 768px) and (max-width: 1023px) { .top-bar { display: flex; } }

.top-brand { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-size: 1rem; color: #e8f5ea; }

/* Tablet top-nav: scroll horizontal se não couber */
.top-nav {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  max-width: calc(100vw - 160px);
}
.top-nav::-webkit-scrollbar { display: none; }
.top-nav button {
  display: flex; align-items: center; gap: 6px;
  background: none; border: 1px solid rgba(255,255,255,.1);
  color: #9ab09d; padding: 8px 12px; border-radius: 8px;
  font-size: 13px; cursor: pointer; transition: .15s;
  white-space: nowrap; flex-shrink: 0;
}
.top-nav button:hover  { color: #fff; border-color: rgba(255,255,255,.25); }
.top-nav button.active { background: var(--color-primary); color: #fff; border-color: transparent; }

/* ── Páginas com scroll normal ── */
.scroll-pages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: var(--nav-h);
}
@media (min-width: 768px) { .scroll-pages { padding-bottom: 0; } }

.page-wrap {
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 0 16px;
}
@media (min-width: 768px) { .page-wrap { padding: 0 28px; } }
@media (min-width: 1024px) { .page-wrap { padding: 0 32px; } }

/* ── Chat ── */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
@media (max-width: 767px) {
  .chat-container { padding-bottom: var(--nav-h); }
}
.chat-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
  padding: 0 16px;
}
@media (min-width: 768px) { .chat-inner { padding: 0 28px; } }
@media (min-width: 1024px) { .chat-inner { padding: 0 32px; } }

/* ── Bottom nav (≤ 767 px) ── */
.bottom-nav {
  display: flex;
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--color-sidebar);
  height: var(--nav-h);
  border-top: 1px solid rgba(255,255,255,.08);
  z-index: 30;
  padding-bottom: env(safe-area-inset-bottom);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.bottom-nav::-webkit-scrollbar { display: none; }
@media (min-width: 768px) { .bottom-nav { display: none; } }

.bottom-nav button {
  flex: 1;
  min-width: 56px; /* garante que 5 botões cabem sem encolher demasiado */
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 3px;
  background: none; border: none; color: #6b8a6e;
  font-size: 10px; font-family: var(--font-body);
  cursor: pointer; transition: .15s; padding: 0; min-height: 44px;
}
.bottom-nav button.active { color: #6fcf8a; }
.bottom-nav button span { font-size: 10px; font-weight: 600; }
</style>