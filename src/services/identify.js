const WORKER_URL = 'https://cold-resonance-5d37.danielbailotedev.workers.dev'

function buildForm(ficheiros, orgaos, extras = {}) {
  const fd = new FormData()
  ficheiros.forEach((f, i) => {
    fd.append('images', f)
    fd.append('organs', orgaos[i] ?? 'auto')
  })
  Object.entries(extras).forEach(([k, v]) => v != null && fd.append(k, v))
  return fd
}

async function post(path, fd) {
  const res = await fetch(WORKER_URL + path, { method: 'POST', body: fd })

  // Rate limit PlantNet (500/dia no free tier)
  if (res.status === 429) {
    const err = new Error(
      'Limite diário de identificações PlantNet atingido (500/dia). O serviço retoma amanhã.'
    )
    err.rateLimited = true
    throw err
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`)
  }

  if (!res.ok) throw new Error(json?.error ?? `Erro HTTP ${res.status}`)
  return json.data
}

export function identificarEspecie(ficheiros, orgaos, opcoes = {}) {
  const fd = buildForm(ficheiros, orgaos, {
    lang: opcoes.lang ?? 'pt',
    'nb-results': opcoes.nbResultados ?? 5,
    project: opcoes.projeto ?? 'all'
  })
  return post('/identify/species', fd)
}

export function identificarVariedade(ficheiros, orgaos, opcoes = {}) {
  const fd = buildForm(ficheiros, orgaos, {
    lang: opcoes.lang ?? 'pt',
    'nb-results': opcoes.nbResultados ?? 5
  })
  return post('/identify/variety', fd)
}

export function identificarDoenca(ficheiros, orgaos, opcoes = {}) {
  const fd = buildForm(ficheiros, orgaos, {
    lang: opcoes.lang ?? 'pt',
    'nb-results': opcoes.nbResultados ?? 5
  })
  return post('/identify/disease', fd)
}