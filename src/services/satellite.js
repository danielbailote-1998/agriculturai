// ─── Sentinel Hub ────────────────────────────────────────────────────────────

const WORKER_URL =
  import.meta.env.VITE_WORKER_URL ||
  "https://falling-sun-56d1.danielbailotedev.workers.dev/";

/**
 * Chama o Cloudflare Worker que faz proxy para a Sentinel Hub API.
 * O Worker devolve: { image: "data:image/png;base64,...", stats: { date, mean, min, max, stDev, sampleCount } }
 */
export async function processIndex({ geometry, index, dateFrom, dateTo, maxCloud = 20 }) {
  if (!geometry) throw new Error("geometry é obrigatório.");
  if (!["ndvi", "ndwi"].includes(index)) throw new Error("index deve ser 'ndvi' ou 'ndwi'.");
  if (!dateFrom || !dateTo) throw new Error("dateFrom e dateTo são obrigatórios.");
  if (new Date(dateFrom) > new Date(dateTo)) throw new Error("dateFrom não pode ser posterior a dateTo.");

  const res = await fetch(`${WORKER_URL}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geometry, index, dateFrom, dateTo, maxCloud }),
  });

  const data = await res.json().catch(() => {
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`);
  });

  if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);

  // O Worker devolve { image, stats: { date, mean, min, max, stDev, sampleCount } }
  // Normalizar para estrutura flat esperada pelo componente
  const stats = data.stats ?? {};
  const image = data.image ?? data.imageUrl ?? null;

  if (!stats || stats.mean == null) {
    throw new Error(
      "Nenhuma imagem disponível para o período e cobertura de nuvens selecionados. " +
      "Tenta alargar o intervalo de datas ou aumentar a cobertura máxima de nuvens."
    );
  }

  return {
    // valores principais
    mean:       stats.mean,
    min:        stats.min  ?? stats.mean,
    max:        stats.max  ?? stats.mean,
    count:      stats.sampleCount ?? 1,
    date:       stats.date ?? null,
    stDev:      stats.stDev ?? null,
    // imagem de preview
    image,
    imageUrl:   image,
    // campos legacy por compatibilidade
    value:      stats.mean,
    ndvi:       index === "ndvi" ? stats.mean : undefined,
    ndwi:       index === "ndwi" ? stats.mean : undefined,
  };
}

export function bboxToGeometry(west, south, east, north) {
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

export function interpretValue(index, value) {
  if (index === "ndvi") {
    if (value < 0.1)  return { label: "Sem vegetação",      color: "#92400e", badge: "danger" };
    if (value < 0.2)  return { label: "Vegetação escassa",  color: "#dc2626", badge: "danger" };
    if (value < 0.4)  return { label: "Vegetação fraca",    color: "#d97706", badge: "warning" };
    if (value < 0.6)  return { label: "Vegetação moderada", color: "#16a34a", badge: "success" };
    if (value < 0.8)  return { label: "Cultura saudável",   color: "#15803d", badge: "success" };
    return               { label: "Vegetação densa",        color: "#166534", badge: "success" };
  }
  if (index === "ndwi") {
    if (value < -0.2) return { label: "Stress hídrico severo", color: "#dc2626", badge: "danger" };
    if (value < -0.1) return { label: "Humidade baixa",        color: "#ea580c", badge: "warning" };
    if (value < 0.2)  return { label: "Humidade adequada",     color: "#0284c7", badge: "info" };
    if (value < 0.4)  return { label: "Bem hidratada",         color: "#0369a1", badge: "info" };
    return               { label: "Excesso de humidade",       color: "#1d4ed8", badge: "primary" };
  }
  return { label: "—", color: "#6c757d", badge: "secondary" };
}

// ─── IPMA ─────────────────────────────────────────────────────────────────────

const IPMA = "https://api.ipma.pt/open-data/";

export async function getStations() {
  const res = await fetch(`${IPMA}observation/meteorology/stations/stations.json`);
  if (!res.ok) throw new Error("Erro ao obter estações IPMA.");
  return res.json();
}

export async function getObservations() {
  const res = await fetch(`${IPMA}observation/meteorology/stations/obs-surface.geojson`);
  if (!res.ok) throw new Error("Erro ao obter observações IPMA.");
  return res.json();
}

export async function getPrevisions(idDay) {
  const res = await fetch(`${IPMA}forecast/meteorology/cities/daily/hp-daily-forecast-day${idDay}.json`);
  if (!res.ok) throw new Error(`Erro ao obter previsão dia ${idDay}.`);
  return res.json();
}

export async function getWarnings() {
  const res = await fetch(`${IPMA}forecast/warnings/warnings_www.json`);
  if (!res.ok) throw new Error("Erro ao obter avisos IPMA.");
  return res.json();
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getClimateForArea(centroid) {
  const [
    stationsResult,
    obsGeoResult,
    f0Result,
    f1Result,
    f2Result,
    warningsResult,
  ] = await Promise.allSettled([
    getStations(),
    getObservations(),
    getPrevisions(0),
    getPrevisions(1),
    getPrevisions(2),
    getWarnings(),
  ]);

  if (stationsResult.status === "rejected") {
    throw new Error("Não foi possível obter as estações meteorológicas IPMA.");
  }

  const stations  = stationsResult.value;
  const obsGeo    = obsGeoResult.status === "fulfilled" ? obsGeoResult.value : { features: [] };
  const warnings  = warningsResult.status === "fulfilled" ? warningsResult.value : [];

  const forecastDays = [f0Result, f1Result, f2Result]
    .map((r, i) => r.status === "fulfilled" ? { data: r.value?.data ?? [], dayOffset: i } : null)
    .filter(Boolean);

  let closest = null;
  let minDist = Infinity;
  for (const st of stations) {
    const lat = st.latitude ?? st.lat;
    const lon = st.longitude ?? st.lon ?? st.lng;
    if (lat == null || lon == null) continue;
    const d = haversine(centroid.lat, centroid.lon, lat, lon);
    if (d < minDist) { minDist = d; closest = { ...st, dist: Math.round(d) }; }
  }

  let obs = null;
  if (closest) {
    const stId = closest.idEstacao ?? closest.stationId ?? closest.id;
    const feat = obsGeo.features?.find((f) => {
      const p = f.properties ?? {};
      return (p.idEstacao ?? p.stationId ?? p.id) === stId;
    });
    obs = feat?.properties ?? null;
  }

  if (closest) {
    closest._nome =
      closest.localEstacao ??
      closest.name ??
      closest.nome ??
      closest.stationName ??
      closest.localName ??
      "Estação " + (closest.idEstacao ?? "—");
  }

  const allDays = forecastDays.map(({ data, dayOffset }) => {
    let best = null, bestDist = Infinity;
    for (const loc of data) {
      const lat = loc.lat ?? loc.latitude ?? 0;
      const lon = loc.lon ?? loc.longitude ?? loc.lng ?? 0;
      const d = haversine(centroid.lat, centroid.lon, lat, lon);
      if (d < bestDist) { bestDist = d; best = loc; }
    }
    return best ? { ...best, dayOffset } : null;
  }).filter(Boolean);

  return { station: closest, obs, forecasts: allDays, warnings: warnings ?? [] };
}

// ─── INIAV (WMS GetFeatureInfo) ───────────────────────────────────────────────

const INIAV_WMS = "https://portalgeo.iniav.pt/arcgis/services/cartografia/solos/MapServer/WMSServer";

const SOIL_LAYERS = [
  { id: "0", key: "ctc",    label: "Cap. Troca Catiónica", unit: "cmolc/kg" },
  { id: "1", key: "corg",   label: "Carbono Orgânico",     unit: "%" },
  { id: "2", key: "ph",     label: "pH",                   unit: "" },
  { id: "3", key: "areia",  label: "Teor de Areia",        unit: "%" },
  { id: "4", key: "limo",   label: "Teor de Limo",         unit: "%" },
  { id: "5", key: "argila", label: "Teor de Argila",       unit: "%" },
];

async function getSoilPoint(lat, lon) {
  const delta = 0.05;
  const bbox = `${lat - delta},${lon - delta},${lat + delta},${lon + delta}`;
  const params = new URLSearchParams({
    SERVICE:      "WMS",
    VERSION:      "1.3.0",
    REQUEST:      "GetFeatureInfo",
    QUERY_LAYERS: SOIL_LAYERS.map((l) => l.id).join(","),
    LAYERS:       SOIL_LAYERS.map((l) => l.id).join(","),
    CRS:          "EPSG:4326",
    BBOX:         bbox,
    WIDTH:        "101",
    HEIGHT:       "101",
    I:            "50",
    J:            "50",
    INFO_FORMAT:  "application/geo+json",
  });

  const res = await fetch(`${INIAV_WMS}?${params}`);
  if (!res.ok) throw new Error(`INIAV WMS erro HTTP ${res.status}`);
  return res.json();
}

export async function getSoilForArea(centroid, bbox) {
  const pts = [
    centroid,
    { lat: (centroid.lat + bbox.north) / 2, lon: (centroid.lon + bbox.west) / 2 },
    { lat: (centroid.lat + bbox.north) / 2, lon: (centroid.lon + bbox.east) / 2 },
    { lat: (centroid.lat + bbox.south) / 2, lon: (centroid.lon + bbox.west) / 2 },
    { lat: (centroid.lat + bbox.south) / 2, lon: (centroid.lon + bbox.east) / 2 },
  ];

  const results = await Promise.allSettled(pts.map((p) => getSoilPoint(p.lat, p.lon)));

  const acc = {};
  SOIL_LAYERS.forEach((l) => { acc[l.key] = []; });

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const features = r.value?.features ?? [];
    for (const feat of features) {
      const props = feat.properties ?? {};
      const layerId = String(feat.id ?? "").split(".")?.[0];
      const layer = SOIL_LAYERS.find((l) => l.id === layerId);
      if (!layer) continue;
      const val = Object.values(props).find((v) => typeof v === "number" && isFinite(v));
      if (val != null) acc[layer.key].push(val);
    }
  }

  return SOIL_LAYERS.map((l) => {
    const vals = acc[l.key];
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return {
      key:   l.key,
      label: l.label,
      unit:  l.unit,
      value: avg != null ? Math.round(avg * 10) / 10 : null,
    };
  });
}

export function getCentroidAndBbox(geometry) {
  const coords = geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const west  = Math.min(...lons);
  const east  = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  return {
    centroid: { lat: (south + north) / 2, lon: (west + east) / 2 },
    bbox: { west, south, east, north },
  };
}