const WORKER = "https://curly-pond-57cb.danielbailotedev.workers.dev";

/**
 * @param {Object} opts
 * @param {string}  opts.message
 * @param {string}  [opts.category]
 * @param {Array}   [opts.history]       - [{role, content}] últimos turnos
 * @param {Object}  [opts.diagnosis]     - resultado PlantNet
 * @param {Object}  [opts.weatherData]   - dados meteo para Q&A baseada no tempo
 */
export async function askAssistant({
  message,
  category    = "auto",
  history     = [],
  diagnosis   = null,
  weatherData = null,
} = {}) {
  const res = await fetch(WORKER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      category,
      history: history.slice(-16), // alinhado com o slice do Worker
      diagnosis,
      weatherData,
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`);
  }

  // Rate limit — mensagem já vem do Worker, propagar com flag
  if (res.status === 429) {
    const err = new Error(data?.error ?? "Limite de pedidos atingido. Tenta novamente daqui a pouco.");
    err.rateLimited = true;
    err.retryAfter  = data?.retryAfter ?? 60;
    throw err;
  }

  if (!res.ok) throw new Error(data?.error ?? `Erro HTTP ${res.status}`);
  return data; // { reply, model }
}