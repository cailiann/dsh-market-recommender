import { DEFAULT_CATALOG_URLS, collectCandidates } from './lib/sources.js'
import { hasCjk, trim } from './lib/match.js'
import { rankCandidates, selectRows } from './lib/recommend.js'
import { registerRoutes } from './lib/http.js'

export const name = 'dsh-market-recommender'
export const inject = ['tools']

const DEFAULTS = {
  defaultLimit: 5,
  maxLimit: 10,
  minScore: 7,
  catalogFallback: true,
  catalogUrls: DEFAULT_CATALOG_URLS,
  catalogTimeoutMs: 12000,
  cacheTtlMs: 900000,
  synonyms: [],
}

function synonymGroups(value) {
  if (!Array.isArray(value)) return []
  const groups = []
  for (const entry of value) {
    const group = Array.isArray(entry)
      ? entry.map((item) => String(item))
      : String(entry).split(/[,，;；]/)
    const cleaned = group.map((item) => item.trim()).filter((item) => item.length > 0)
    if (cleaned.length > 0) groups.push(cleaned)
  }
  return groups
}

function describeStatus(candidate) {
  const version = candidate.installedVersion || candidate.version
  if (candidate.enabled) {
    return `${candidate.official ? 'official, ' : ''}enabled${version ? ` ${version}` : ''}`
  }
  if (candidate.installed) {
    return `${candidate.official ? 'official, ' : ''}installed${version ? ` ${version}` : ''}, disabled`
  }
  if (candidate.official) return 'official, built into this installation, not enabled'
  return 'not installed'
}

function candidateBlock(item, position, preferZh) {
  const { candidate, matched } = item
  const title = preferZh
    ? candidate.titleZh || candidate.titleEn
    : candidate.titleEn || candidate.titleZh
  const description = preferZh
    ? candidate.descZh || candidate.descEn
    : candidate.descEn || candidate.descZh
  const lines = [`${position}. ${candidate.name}${title && title !== candidate.name ? ` — ${trim(title, 80)}` : ''}`]
  if (description) lines.push(`   ${trim(description, 260)}`)

  const meta = []
  const category = preferZh
    ? candidate.categoryTitleZh || candidate.categoryTitleEn || candidate.category
    : candidate.categoryTitleEn || candidate.categoryTitleZh || candidate.category
  if (category) meta.push(`category: ${category}`)
  if (candidate.keywords?.length) meta.push(`keywords: ${candidate.keywords.slice(0, 6).join(', ')}`)
  if (candidate.labels?.length) meta.push(`labels: ${candidate.labels.slice(0, 4).join(', ')}`)
  if (meta.length > 0) lines.push(`   ${meta.join(' · ')}`)

  if (candidate.installSpec) lines.push(`   install spec: ${candidate.installSpec}`)
  else if (candidate.homepage) lines.push(`   source: ${candidate.homepage}`)
  lines.push(`   status: ${describeStatus(candidate)}`)
  const matchedTerms = matched
    .slice(0, 8)
    .filter(([term, field]) => !/[\u3400-\u9fff]/.test(term) || field >= 2.2)
    .slice(0, 6)
    .map(([term]) => term)
  if (matchedTerms.length > 0) lines.push(`   matched: ${matchedTerms.join(', ')}`)
  return lines.join('\n')
}

function formatReport({ need, notes, scored, limit, minScore, preferZh }) {
  const lines = [`Plugin market search for: "${trim(need, 120)}"`, '', 'Sources searched']
  for (const note of notes) lines.push(`- ${note}`)
  lines.push('')

  if (scored.length === 0) {
    lines.push('Result: no candidate shares any word with this need.')
    lines.push('Nothing among the searched sources covers it, so write a small new plugin instead.')
    return lines.join('\n')
  }

  // A real match needs enough score *and* evidence in a name, title, keyword, or
  // across most of the need itself; two incidental description words are not a match.
  const strong = scored.filter((item) => item.score >= minScore && (item.strongField >= 2.2 || item.literalCoverage >= 0.5))
  const { rows, extras } = selectRows({ strong, scored, limit })

  if (strong.length > 0) {
    lines.push(`Result: ${rows.length} candidate${rows.length === 1 ? '' : 's'} worth recommending, best first`)
    if (extras.length > 0) lines.push('The last one ships with this installation and also matches, so it needs no download.')
  } else {
    lines.push('Result: no close match — nearest candidates only')
  }
  lines.push('')

  rows.forEach((item, position) => lines.push(candidateBlock(item, position + 1, preferZh)))

  const alreadyOn = rows.find((item) => item.candidate.enabled)
  lines.push('')
  if (strong.length === 0) {
    lines.push('None of these is a real fit for this need, so write a small new plugin instead of installing one of them.')
  } else if (alreadyOn) {
    lines.push(`${alreadyOn.candidate.name} is already enabled, so this need may already be met without installing anything.`)
  } else {
    lines.push('Next: recommend the best-fitting candidate above in the user\'s language, with its install spec, and ask before installing or enabling it. This tool changes nothing itself.')
  }
  return lines.join('\n')
}

/** Model-facing definition; the registry takes the parameter and output JSON Schemas as written. */
function buildDefinition(config, ctx) {
  const maxLimit = Number(config.maxLimit) > 0 ? Math.floor(Number(config.maxLimit)) : DEFAULTS.maxLimit
  const defaultLimit = Math.min(
    Number(config.defaultLimit) > 0 ? Math.floor(Number(config.defaultLimit)) : DEFAULTS.defaultLimit,
    maxLimit,
  )
  const minScore = Number(config.minScore) > 0 ? Number(config.minScore) : DEFAULTS.minScore

  return {
    name: 'recommend_plugin',
    description: 'Search what this DSH profile can install from — its configured plugin-market indexes, the community dshmarket catalog, and the optional plugins built into this DSH installation — for a plugin that already does what the user described. Call it before building a new plugin, and whenever the user asks which plugin can do something. Returns ranked candidates with an install spec and current installation status; it neither installs nor enables anything.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        need: {
          type: 'string',
          description: 'The outcome the user wants, in their own words; English and Chinese both work.',
        },
        limit: {
          type: 'integer',
          description: `How many candidates to return. Defaults to ${defaultLimit}; values above ${maxLimit} are clamped to ${maxLimit}.`,
        },
      },
      required: ['need'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          report: { type: 'string' },
        },
        required: ['report'],
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    timeoutMs: 90000,
    async execute(args, exec) {
      const need = String(args?.need ?? '').trim()
      if (need.length === 0) throw new Error('recommend_plugin needs a non-empty `need`')

      const requestedLimit = Number(args?.limit)
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), maxLimit)
        : defaultLimit

      const { candidates, notes } = await collectCandidates({
        ctx,
        config: { ...config, need },
        signal: exec?.signal,
      })
      const { scored } = rankCandidates({
        candidates,
        need,
        synonyms: config.synonymGroups ?? [],
        minScore,
      })

      return {
        report: formatReport({ need, notes, scored, limit, minScore, preferZh: hasCjk(need) }),
      }
    },
  }
}

/**
 * Mount the panel routes on the browser HTTP carrier.
 *
 * `ctx.inject` is the ordering-safe way to reach an optional service: the callback
 * runs when `webServer` is mounted, not when this plugin happens to be applied.
 * A cold start and a live bundle reload mount services in a different order, so a
 * one-shot `ctx.get('webServer')` at apply time can silently return nothing — which
 * is exactly how the panel lost its routes and answered 405 through the SPA fallback.
 */
function registerWebRoutes(ctx, config) {
  const mount = (scope) => {
    const webServer = scope.webServer
    if (!webServer || typeof webServer.register !== 'function') {
      ctx.logger?.warn?.('[dsh-market-recommender] no webServer in this profile; the panel cannot call the host half')
      return
    }
    try {
      scope.effect(() => registerRoutes(webServer, config, ctx))
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-market-recommender] route registration failed: ${error?.message ?? error}`)
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], mount)
    return
  }

  let webServer
  try {
    webServer = ctx.get?.('webServer') ?? ctx.webServer
  } catch {
    webServer = undefined
  }
  if (!webServer) {
    ctx.logger?.warn?.('[dsh-market-recommender] no webServer in this profile; the panel cannot call the host half')
    return
  }
  mount({ webServer, effect: (callback) => ctx.effect(callback) })
}

export function apply(ctx, rawConfig) {
  const config = {
    ...DEFAULTS,
    ...(rawConfig ?? {}),
    synonymGroups: synonymGroups((rawConfig ?? {}).synonyms),
  }
  ctx.tools.register(buildDefinition(config, ctx))
  registerWebRoutes(ctx, config)
}
