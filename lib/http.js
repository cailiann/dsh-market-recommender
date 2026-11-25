import { catalogCandidate, collectCandidates, loadCatalog } from './sources.js'
import { publicCandidate, rankCandidates, selectRows } from './recommend.js'
import { hasCjk } from './match.js'

const BASE = 'market-recommender'

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

function loopbackAuthority(host) {
  if (host === undefined) return false
  const lower = host.toLowerCase()
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]'
}

/**
 * Refuse a mutating request from another origin. An exact route on the bare web
 * server sits in front of the core /api fence, so it has to state this itself:
 * `Host` must name a loopback authority (a rebinding page cannot forge it), and
 * an Origin, when the client sends one, must match that Host.
 */
function sameOrigin(request) {
  const host = request.headers.host
  if (host !== undefined && !loopbackAuthority(host)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    const originUrl = new URL(origin)
    if (originUrl.host === host) return true
    return originUrl.port === '' && host !== undefined && loopbackAuthority(host)
  } catch {
    return false
  }
}

/**
 * Ask the host's request gate before a route touches user data.
 *
 * DSH 0.2.3 carries the same fence its own /api runs: `connection.requestRejection`
 * answers a status code for a request it refuses and `undefined` for one it admits.
 * An exact route sits in front of the /api prefix fence, so it never sees it and has
 * to ask itself. Hosts without the service (0.2.2 and older) have no fence to ask;
 * sameOrigin below is what protects them.
 *
 * @returns true when the request was answered here, so the caller must stop.
 */
function refuseUnadmitted(ctx, request, response) {
  let connection
  try {
    connection = typeof ctx?.get === 'function' ? ctx.get('connection') : undefined
  } catch {
    return false
  }
  const gate = connection?.requestRejection
  if (typeof gate !== 'function') return false

  let status
  try {
    status = gate.call(connection, request)
  } catch {
    // A gate that throws has admitted nothing. Failing open here would turn a
    // host bug into the exposure this check exists to close.
    status = 403
  }
  if (status === undefined || status === null) return false

  const code = Number(status)
  const safe = Number.isFinite(code) && code >= 400 && code <= 599 ? code : 403
  sendJson(response, safe, {
    error: safe === 401 ? 'DSH login required' : 'untrusted origin',
  })
  return true
}

async function readJsonBody(request, maxBytes = 8192) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function clampLimit(value, fallback, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.min(Math.floor(number), max)
}

function summarize(result) {
  if (!result) return { application: 'unknown' }
  return {
    changed: Boolean(result.changed),
    application: result.application ?? 'unknown',
    stage: result.stage,
    target: result.target,
    version: result.version,
    bundle: result.bundle,
    restartReason: result.restartReason,
    pendingBuilds: result.pendingBuilds,
    error: result.error
      ? { code: result.error.code, diagnostic: result.error.diagnostic ?? '' }
      : undefined,
  }
}

async function handleSearch(ctx, config, request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' })
    response.end()
    return
  }
  if (refuseUnadmitted(ctx, request, response)) return
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return
  }

  let body
  try {
    body = await readJsonBody(request)
  } catch {
    sendJson(response, 400, { error: 'invalid JSON body' })
    return
  }

  const need = String(body?.need ?? '').trim()
  if (need.length === 0) {
    sendJson(response, 400, { error: 'need is required' })
    return
  }
  const limit = clampLimit(body?.limit, config.defaultLimit ?? 5, config.maxLimit ?? 10)

  try {
    const { candidates, notes } = await collectCandidates({ ctx, config: { ...config, need } })
    const { strong, scored } = rankCandidates({
      candidates,
      need,
      synonyms: config.synonymGroups ?? [],
      minScore: config.minScore ?? 7,
    })
    const { rows } = selectRows({ strong, scored, limit })
    sendJson(response, 200, {
      need,
      notes,
      matched: strong.length > 0,
      candidates: rows.map((item) => publicCandidate(item, hasCjk(need))),
    })
  } catch (error) {
    sendJson(response, 500, { error: error?.message ?? String(error) })
  }
}

async function handleAct(ctx, config, request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, { allow: 'POST' })
    response.end()
    return
  }
  if (refuseUnadmitted(ctx, request, response)) return
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return
  }

  let body
  try {
    body = await readJsonBody(request)
  } catch {
    sendJson(response, 400, { error: 'invalid JSON body' })
    return
  }

  const name = String(body?.name ?? '').trim()
  if (name.length === 0) {
    sendJson(response, 400, { error: 'name is required' })
    return
  }

  const manager = ctx.get?.('pluginManager')
  if (!manager) {
    sendJson(response, 503, { error: 'plugin manager is not mounted in this profile' })
    return
  }

  try {
    if (body?.action === 'enable') {
      sendJson(response, 200, summarize(await manager.setBundleEnabled(name, true)))
      return
    }
    const spec = String(body?.spec ?? '').trim()
    if (spec.length === 0) {
      sendJson(response, 400, { error: 'install needs a spec' })
      return
    }
    const version = String(body?.version ?? '').trim()
    const options = version.length > 0 ? { expected: { name, version } } : {}
    sendJson(response, 200, summarize(await manager.installBundle(spec, options)))
  } catch (error) {
    sendJson(response, 500, { error: error?.message ?? String(error) })
  }
}

const dailyCache = { day: '', picks: [] }

function daySeed(day) {
  let hash = 2166136261
  for (let index = 0; index < day.length; index += 1) {
    hash ^= day.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRank(name, seed) {
  let hash = seed ^ 0x9e3779b9
  for (let index = 0; index < name.length; index += 1) {
    hash = Math.imul(hash ^ name.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

/** Three picks for today: stable within a day, different every day, one category each. */
async function handleDaily(ctx, config, request, response) {
  if (request.method !== 'GET') {
    response.writeHead(405, { allow: 'GET' })
    response.end()
    return
  }
  if (refuseUnadmitted(ctx, request, response)) return
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return
  }
  const url = new URL(request.url ?? '/', 'http://localhost')
  const preferZh = url.searchParams.get('lang') === 'zh'
  const day = new Date().toISOString().slice(0, 10)
  if (dailyCache.day === day && dailyCache.picks.length === 3) {
    sendJson(response, 200, { date: day, picks: dailyCache.picks })
    return
  }

  const notes = []
  let document
  try {
    document = await loadCatalog(config, undefined, notes)
  } catch (error) {
    document = undefined
    notes.push(`catalog failed: ${error?.message ?? error}`)
  }
  if (!document) {
    sendJson(response, 503, { error: 'community catalog unavailable', notes })
    return
  }

  const installed = new Set()
  try {
    const manager = ctx.get?.('pluginManager')
    const rows = (await manager?.listPlugins?.()) ?? []
    for (const row of rows) installed.add(String(row?.moduleName ?? '').toLowerCase())
  } catch {
    // an unreadable plugin list only makes the picks less precise
  }

  const seed = daySeed(day)
  const ranked = document.plugins
    .filter((plugin) => Array.isArray(plugin.versions) && plugin.versions.some((version) => version?.source?.type === 'npm'))
    .filter((plugin) => !installed.has(String(plugin.name).toLowerCase()))
    .map((plugin) => ({ plugin, rank: seededRank(String(plugin.name), seed) }))
    .sort((left, right) => left.rank - right.rank)

  const picks = []
  const usedCategories = new Set()
  for (const entry of ranked) {
    if (picks.length === 3) break
    const category = entry.plugin.metadata?.category ?? ''
    if (category && usedCategories.has(category)) continue
    picks.push(entry.plugin)
    if (category) usedCategories.add(category)
  }
  for (const entry of ranked) {
    if (picks.length === 3) break
    if (!picks.includes(entry.plugin)) picks.push(entry.plugin)
  }

  const rows = picks.map((plugin) => publicCandidate({
    candidate: catalogCandidate(plugin, document, 'community catalog'),
    matched: [],
  }, preferZh))
  dailyCache.day = day
  dailyCache.picks = rows
  sendJson(response, 200, { date: day, picks: rows })
}

/**
 * Register the routes the Plugins panel calls.
 *
 * Each handler first asks the host's request gate (DSH >= 0.2.3) and then checks
 * same-origin, so a page in the browser cannot drive them on a host that has the
 * gate, and an undeclared authority cannot drive them on one that does not.
 * @returns the disposer, or undefined when the server cannot host named routes.
 */
export function registerRoutes(webServer, config, ctx) {
  if (!webServer || typeof webServer.register !== 'function') return undefined

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: `/${BASE}/search`,
      handler: (request, response) => handleSearch(ctx, config, request, response),
    }),
    webServer.register({
      kind: 'exact',
      path: `/${BASE}/act`,
      handler: (request, response) => handleAct(ctx, config, request, response),
    }),
    webServer.register({
      kind: 'exact',
      path: `/${BASE}/daily`,
      handler: (request, response) => handleDaily(ctx, config, request, response),
    }),
  ]
  return () => {
    for (const dispose of disposers) dispose()
  }
}
