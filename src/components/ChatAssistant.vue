<script setup>
import { ref, nextTick } from "vue";
import {
  Bot, User, Send, Trash2,
  Sprout, Bug, CloudSun, Leaf, Banknote, Tractor, Zap,
  AlertTriangle, Clock
} from "lucide-vue-next";
import { askAssistant } from "../services/chat.js";

const input      = ref("");
const category   = ref("auto");
const loading    = ref(false);
const messagesEl = ref(null);
const textareaEl = ref(null);
const historico  = ref([]);

const categories = [
  { id: "auto",     label: "Auto",     icon: Bot },
  { id: "culturas", label: "Culturas", icon: Sprout },
  { id: "pragas",   label: "Pragas",   icon: Bug },
  { id: "clima",    label: "Clima",    icon: CloudSun },
  { id: "solo",     label: "Solo",     icon: Leaf },
  { id: "apoios",   label: "IFAP",     icon: Banknote },
  { id: "tecnicas", label: "Técnicas", icon: Tractor },
];

const quickPrompts = [
  "Quando podar oliveiras no Alentejo?",
  "Como tratar míldio na vinha?",
  "pH ideal para tomate de indústria?",
  "Apoios IFAP para jovens agricultores?",
  "Calendário de sementeira de trigo mole?",
  "Rega por gotejamento em solos argilosos?",
];

function scrollDown() {
  nextTick(() => {
    if (messagesEl.value)
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

function usePrompt(p) {
  input.value = p;
  nextTick(() => {
    if (textareaEl.value) textareaEl.value.focus();
  });
}

function limparHistorico() { historico.value = []; }

function formatTs(ts) {
  return new Date(ts).toLocaleTimeString("pt-PT", {
    hour: "2-digit", minute: "2-digit",
  });
}

function resetTextarea() {
  if (textareaEl.value) {
    textareaEl.value.style.height = "auto";
  }
}

async function enviar() {
  const msg = input.value.trim();
  if (!msg || loading.value) return;

  historico.value.push({ role: "user", content: msg, ts: new Date() });
  input.value = "";
  resetTextarea();
  loading.value = true;
  scrollDown();

  const historyPayload = historico.value
    .slice(0, -1)
    .map(({ role, content }) => ({ role, content }));

  try {
    const data = await askAssistant({
      message:  msg,
      category: category.value,
      history:  historyPayload,
    });
    historico.value.push({
      role:    "assistant",
      content: data.reply || "Sem resposta.",
      model:   data.model || null,
      ts:      new Date(),
    });
  } catch (err) {
    historico.value.push({
      role:        "assistant",
      content:     err.message || "Erro ao comunicar com o servidor. Tenta novamente.",
      error:       true,
      rateLimited: err.rateLimited ?? false,
      retryAfter:  err.retryAfter ?? null,
      ts:          new Date(),
    });
  }

  loading.value = false;
  scrollDown();
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    enviar();
  }
}

function onTextareaFocus() {
  // Em mobile, quando o teclado abre, rola para mostrar as mensagens mais recentes
  setTimeout(() => scrollDown(), 300);
}
</script>

<template>
  <div class="chat">

    <header class="chat-head">
      <div>
        <h2>Assistente técnico agrícola</h2>
        <p class="chat-head-sub">Conversação multi-turno · Groq LLaMA 3.1 com fallback Workers AI</p>
      </div>
      <button v-if="historico.length" class="clear-btn" @click="limparHistorico" title="Limpar conversa">
        <Trash2 :size="15" />
      </button>
    </header>

    <div class="categories" role="group" aria-label="Categoria">
      <button
        v-for="c in categories" :key="c.id"
        :class="{ active: category === c.id }"
        @click="category = c.id"
        :title="c.label"
      >
        <component :is="c.icon" :size="14" />
        <span>{{ c.label }}</span>
      </button>
    </div>

    <!-- Estado vazio -->
    <div v-if="!historico.length" class="empty-state">
      <div class="empty-inner">
        <Bot :size="32" class="empty-icon" />
        <p class="empty-title">Como posso ajudar?</p>
        <p class="empty-sub">Pergunta em texto livre ou escolhe um exemplo abaixo.</p>
        <div class="quick-prompts">
          <button v-for="p in quickPrompts" :key="p" @click="usePrompt(p)">{{ p }}</button>
        </div>
      </div>
    </div>

    <!-- Mensagens -->
    <div v-else class="messages" ref="messagesEl">
      <template v-for="(m, i) in historico" :key="i">
        <div class="msg" :class="m.role">
          <div class="msg-avatar">
            <Bot v-if="m.role === 'assistant'" :size="14" />
            <User v-else :size="14" />
          </div>
          <div class="msg-body">
            <div class="msg-content" :class="{ 'msg-error': m.error, 'msg-rate-limit': m.rateLimited }">
              <div v-if="m.rateLimited" class="rate-limit-header">
                <Clock :size="13" />
                <span>Limite atingido</span>
              </div>
              <AlertTriangle v-else-if="m.error" :size="13" class="inline-err-icon" />
              {{ m.content }}
              <div v-if="m.rateLimited && m.retryAfter" class="retry-hint">
                Podes tentar novamente em {{ m.retryAfter < 60 ? m.retryAfter + 's' : Math.ceil(m.retryAfter / 60) + ' min' }}.
              </div>
            </div>
            <div class="msg-meta">
              <span>{{ formatTs(m.ts) }}</span>
              <span v-if="m.model" class="msg-model">{{ m.model }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="loading" class="msg assistant typing-msg">
        <div class="msg-avatar"><Bot :size="14" /></div>
        <div class="msg-body">
          <div class="typing-dots"><span /><span /><span /></div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="input-area">
      <div class="input-wrap">
        <textarea
          ref="textareaEl"
          v-model="input"
          :placeholder="loading ? 'A aguardar resposta...' : 'Escreve a tua pergunta...'"
          :disabled="loading"
          rows="1"
          @keydown="onKeydown"
          @focus="onTextareaFocus"
          @input="e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }"
        />
        <button class="send-btn" @click="enviar" :disabled="loading || !input.trim()">
          <Send :size="17" />
        </button>
      </div>
      <div class="input-hint">
        <span><Zap :size="11" /> Categoria: <strong>{{ categories.find(c => c.id === category)?.label }}</strong></span>
        <span class="hint-shortcut">Ctrl+Enter para enviar</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding-top: 20px;
}
@media (max-width: 767px) {
  .chat { padding-top: 10px; }
}

/* ── Cabeçalho ── */
.chat-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-shrink: 0;
  margin-bottom: 10px;
}
.chat-head h2 {
  font-family: var(--font-display);
  font-size: clamp(1.05rem, 3.5vw, 1.5rem);
  margin: 0 0 3px;
}
.chat-head-sub { color: var(--color-muted); margin: 0; font-size: 12px; }

@media (max-width: 767px) {
  .chat-head { margin-bottom: 8px; }
  .chat-head-sub { display: none; }
}

.clear-btn {
  background: none; border: 1px solid var(--color-border);
  border-radius: 8px; padding: 7px; cursor: pointer;
  color: var(--color-muted); display: flex; transition: .15s; flex-shrink: 0;
}
.clear-btn:hover { color: var(--color-warn); border-color: var(--color-warn); }

/* ── Categorias ── */
.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  flex-shrink: 0;
  margin-bottom: 10px;
}

@media (max-width: 767px) {
  .categories {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    margin-bottom: 8px;
    padding: 2px 0 4px;
  }
  .categories::-webkit-scrollbar { display: none; }
  .categories button { flex-shrink: 0; }
}

.categories button {
  display: flex; align-items: center; gap: 5px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 6px 10px; font-size: 12px;
  cursor: pointer; transition: .15s; min-height: 34px;
  font-family: var(--font-body); white-space: nowrap;
}
.categories button:hover  { border-color: var(--color-primary); }
.categories button.active { background: var(--color-primary); color: white; border-color: transparent; }

/* ── Estado vazio ── */
.empty-state {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 5px;
  padding: 16px 12px 20px;
  min-height: 100%;
}
@media (max-width: 767px) {
  .empty-inner {
    justify-content: flex-start;
    padding-top: 20px;
  }
}
.empty-icon  { color: var(--color-border); margin-bottom: 2px; flex-shrink: 0; }
.empty-title { font-family: var(--font-display); font-size: 1.15rem; margin: 0; }
.empty-sub   { color: var(--color-muted); margin: 0; font-size: 13px; }

.quick-prompts {
  display: flex; flex-wrap: wrap; gap: 7px;
  justify-content: center; margin-top: 10px;
  max-width: 480px; width: 100%;
}
.quick-prompts button {
  border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-ink); padding: 8px 12px; border-radius: 999px;
  cursor: pointer; font-size: 13px; transition: .15s; font-family: var(--font-body);
  text-align: left;
}
.quick-prompts button:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* ── Mensagens ── */
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 12px;
  scroll-behavior: smooth;
}
@media (max-width: 767px) {
  .messages { gap: 10px; padding: 4px 0 8px; }
}

.msg { display: flex; gap: 9px; align-items: flex-start; }
.msg.user { flex-direction: row-reverse; }

.msg-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: var(--color-primary-lt); color: var(--color-primary);
}
.msg.user .msg-avatar { background: var(--color-ink); color: white; }

@media (max-width: 767px) {
  .msg-avatar { width: 24px; height: 24px; }
}

.msg-body {
  display: flex; flex-direction: column; gap: 3px;
  max-width: min(78%, 560px);
}
.msg.user .msg-body { align-items: flex-end; }

@media (max-width: 767px) {
  .msg-body { max-width: 88%; }
}

.msg-content {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 14px; padding: 10px 13px;
  font-size: 14px; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
}
.msg.user .msg-content { background: var(--color-primary); color: white; border-color: transparent; }

.msg-content.msg-error  { border-color: #f5c2c2; background: #fff5f5; color: var(--color-warn); }
.msg-content.msg-rate-limit {
  border-color: #f5d9b8; background: #fff9f0; color: var(--color-ink);
}

.rate-limit-header {
  display: flex; align-items: center; gap: 5px;
  font-weight: 600; font-size: 12px;
  color: var(--color-accent); margin-bottom: 6px;
}
.inline-err-icon {
  display: inline; vertical-align: middle;
  margin-right: 5px; color: var(--color-warn);
}
.retry-hint {
  margin-top: 8px; font-size: 12px;
  color: var(--color-muted); font-style: italic;
}

.msg-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; color: var(--color-muted);
  padding: 0 3px; font-family: var(--font-mono);
}
.msg-model {
  background: var(--color-primary-lt); color: var(--color-primary);
  padding: 1px 6px; border-radius: 999px; font-size: 10px;
}

/* ── Typing dots ── */
.typing-msg .msg-body { padding-top: 4px; }
.typing-dots { display: flex; gap: 4px; padding: 10px 13px; }
.typing-dots span {
  width: 6px; height: 6px; background: var(--color-muted);
  border-radius: 50%; animation: bounce .9s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: .15s; }
.typing-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

/* ── Input ── */
.input-area {
  flex-shrink: 0;
  padding: 8px 0 12px;
  border-top: 1px solid var(--color-border);
}
@media (max-width: 767px) {
  .input-area { padding: 7px 0 8px; }
}

.input-wrap {
  display: flex; gap: 8px; align-items: flex-end;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 14px; padding: 7px 7px 7px 13px; transition: border-color .15s;
}
.input-wrap:focus-within { border-color: var(--color-primary); }

textarea {
  flex: 1; border: none; outline: none; resize: none;
  font-family: var(--font-body); font-size: 14px;
  background: transparent; color: var(--color-ink);
  line-height: 1.5; min-height: 24px; max-height: 120px; overflow-y: auto;
  /* Evita zoom automático no iOS ao focar */
  font-size: max(16px, 14px);
}
textarea::placeholder { color: var(--color-muted); }
textarea:disabled { opacity: .6; }

.send-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--color-primary); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: .15s;
}
.send-btn:hover:not(:disabled) { background: var(--color-primary-dk); }
.send-btn:disabled { opacity: .4; cursor: not-allowed; }

.input-hint {
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--color-muted); padding: 4px 3px 0;
}
.input-hint span { display: flex; align-items: center; gap: 4px; }

/* Shortcut só aparece em desktop */
.hint-shortcut { display: none; }
@media (min-width: 768px) {
  .hint-shortcut { display: flex; }
}
</style>