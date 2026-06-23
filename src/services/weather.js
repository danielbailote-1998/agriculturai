// Tudo vai pelo Worker — sem fetch directo ao IPMA (resolve CORS em day3/day4)
const WORKER = "https://curly-pond-57cb.danielbailotedev.workers.dev";

export const WEATHER_TYPES = {
  1:  { label: "Céu limpo",                 icon: "Sun" },
  2:  { label: "Céu pouco nublado",          icon: "CloudSun" },
  3:  { label: "Céu parcialmente nublado",   icon: "Cloud" },
  4:  { label: "Céu muito nublado",          icon: "Cloud" },
  5:  { label: "Nublado (nuvens altas)",     icon: "Cloud" },
  6:  { label: "Aguaceiros",                 icon: "CloudRain" },
  7:  { label: "Aguaceiros fracos",          icon: "CloudDrizzle" },
  8:  { label: "Aguaceiros fortes",          icon: "CloudRain" },
  9:  { label: "Chuva",                      icon: "CloudRain" },
  10: { label: "Chuva fraca / chuvisco",     icon: "CloudDrizzle" },
  11: { label: "Chuva forte",                icon: "CloudRainWind" },
  12: { label: "Períodos de chuva",          icon: "CloudDrizzle" },
  13: { label: "Períodos de chuva fraca",    icon: "CloudDrizzle" },
  14: { label: "Períodos de chuva forte",    icon: "CloudRain" },
  15: { label: "Chuvisco",                   icon: "CloudDrizzle" },
  16: { label: "Neblina",                    icon: "CloudFog" },
  17: { label: "Nevoeiro",                   icon: "CloudFog" },
  18: { label: "Neve",                       icon: "CloudSnow" },
  19: { label: "Trovoada",                   icon: "CloudLightning" },
  20: { label: "Aguaceiros com trovoada",    icon: "CloudLightning" },
  21: { label: "Granizo",                    icon: "CloudRain" },
  22: { label: "Geada",                      icon: "Snowflake" },
  23: { label: "Chuva com trovoada",         icon: "CloudLightning" },
  24: { label: "Nebulosidade convectiva",    icon: "Cloud" },
  25: { label: "Períodos muito nublado",     icon: "Cloud" },
  26: { label: "Nevoeiro",                   icon: "CloudFog" },
  27: { label: "Céu nublado",                icon: "Cloud" },
  28: { label: "Aguaceiros de neve",         icon: "CloudSnow" },
  29: { label: "Chuva e neve",               icon: "CloudSnow" },
  30: { label: "Chuva e neve",               icon: "CloudSnow" },
};

export const WIND_PT = {
  N: "Norte", NE: "Nordeste", E: "Este", SE: "Sudeste",
  S: "Sul",   SW: "Sudoeste", W: "Oeste", NW: "Noroeste"
};

export const WIND_CLASS = {
  1: "Fraco (<20 km/h)",
  2: "Moderado (20–40 km/h)",
  3: "Forte (40–65 km/h)",
  4: "Muito forte (>65 km/h)"
};

const ZONES_CACHE_KEY = "ipma_zones_v1";

export async function getZonas() {
  try {
    const cached = sessionStorage.getItem(ZONES_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  const res = await fetch(`${WORKER}/weather/zones`);
  if (!res.ok) throw new Error("Não foi possível obter as zonas IPMA.");
  const json = await res.json();

  const zonas = (json.data ?? [])
    .map(z => ({
      id:    z.globalIdLocal,
      nome:  z.local,
      lat:   parseFloat(z.latitude),
      lon:   parseFloat(z.longitude),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));

  try {
    sessionStorage.setItem(ZONES_CACHE_KEY, JSON.stringify(zonas));
  } catch {}

  return zonas;
}

export async function getPrevisao(globalIdLocal) {
  const res = await fetch(`${WORKER}/weather/forecast?id=${globalIdLocal}&days=5`);
  if (!res.ok) throw new Error("Não foi possível obter a previsão.");
  const json = await res.json();

  return (json.data ?? []).map((d, i) => {
    const wt = WEATHER_TYPES[d.idTipoTempo] ?? { label: "Desconhecido", icon: "Cloud" };
    return {
      ...d,
      dia:              i,
      estado:           wt.label,
      icone:            wt.icon,
      ventoLabel:       WIND_PT[d.vento] ?? d.vento,
      classeVentoLabel: WIND_CLASS[d.classeVento] ?? null,
    };
  });
}

export function getZonaSalva() {
  try {
    const s = localStorage.getItem("agriculturai_zona");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function salvarZona(zona) {
  try {
    localStorage.setItem("agriculturai_zona", JSON.stringify(zona));
  } catch {}
}