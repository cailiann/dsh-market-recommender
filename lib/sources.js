import { normalize, pickLocalized } from './match.js'

/** Community catalogs, tried in order: a CDN copy first, then the origin sites. */
export const DEFAULT_CATALOG_URLS = [
  'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json',
  'https://awesome-dsh-plugin.com/index.json',
  'https://dshmarket.com/index.json',
]

const catalogCache = new Map()
let preferredCatalogUrl = null

function describeError(error) {
  return error?.message ?? String(error)
}

async function readJson(url, timeoutMs, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const forwardAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return JSON.parse(await response.text())
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }
}

function mergeCandidates(a, b) {
  const [keep, other] = (a.sourceRank ?? 0) >= (b.sourceRank ?? 0) ? [a, b] : [b, a]
  return {
    ...other,
    ...keep,
    titleEn: keep.titleEn || other.titleEn,
    titleZh: keep.titleZh || other.titleZh,
    descEn: keep.descEn || other.descEn,
    descZh: keep.descZh || other.descZh,
    category: keep.category || other.category,
    categoryTitleEn: keep.categoryTitleEn || other.categoryTitleEn,
    categoryTitleZh: keep.categoryTitleZh || other.categoryTitleZh,
    keywords: keep.keywords?.length ? keep.keywords : (other.keywords ?? []),
    labels: [...new Set([...(keep.labels ?? []), ...(other.labels ?? [])])],
    installSpec: keep.installSpec || other.installSpec,
    version: keep.version || other.version,
    installedVersion: keep.installedVersion || other.installedVersion,
    installed: Boolean(keep.installed || other.installed),
    enabled: Boolean(keep.enabled || other.enabled),
    official: Boolean(keep.official || other.official),
    sourceRank: Math.max(keep.sourceRank ?? 0, other.sourceRank ?? 0),
  }
}

export function catalogCandidate(plugin, index, url) {
  const versions = Array.isArray(plugin.versions) ? plugin.versions : []
  const npmVersion = versions.find((version) => version?.source?.type === 'npm') ?? versions[0]
  const categoryId = plugin.metadata?.category ?? ''
  const categoryMeta = index.metadata?.categories?.[categoryId]?.title
  return {
    name: plugin.name,
    titleEn: pickLocalized(plugin.title, false),
    titleZh: pickLocalized(plugin.title, true),
    descEn: pickLocalized(plugin.description, false),
    descZh: pickLocalized(plugin.description, true),
    keywords: Array.isArray(plugin.metadata?.keywords) ? plugin.metadata.keywords : [],
    labels: Array.isArray(plugin.metadata?.labels) ? plugin.metadata.labels : [],
    category: categoryId,
    categoryTitleEn: pickLocalized(categoryMeta, false),
    categoryTitleZh: pickLocalized(categoryMeta, true),
    version: npmVersion?.version,
    installSpec: npmVersion ? `${plugin.name}@${npmVersion.version}` : undefined,
    homepage: plugin.homepage,
    installed: false,
    enabled: false,
    sourceLabel: `community catalog (${url})`,
    sourceRank: 1,
  }
}

export async function loadCatalog(config, signal, notes) {
  const configured = Array.isArray(config.catalogUrls) && config.catalogUrls.length > 0
    ? config.catalogUrls
    : DEFAULT_CATALOG_URLS
  const urls = [...configured]
  if (preferredCatalogUrl && urls.includes(preferredCatalogUrl)) {
    urls.splice(urls.indexOf(preferredCatalogUrl), 1)
    urls.unshift(preferredCatalogUrl)
  }

  const ttl = Number(config.cacheTtlMs) > 0 ? Number(config.cacheTtlMs) : 0
  const timeoutMs = Number(config.catalogTimeoutMs) > 0 ? Number(config.catalogTimeoutMs) : 20000

  if (typeof fetch !== 'function') {
    notes.push('community catalog: unavailable — this runtime has no global fetch')
    return undefined
  }

  for (const url of urls) {
    const now = Date.now()
    const cached = catalogCache.get(url)
    if (cached && ttl > 0 && now - cached.fetchedAt < ttl) {
      notes.push(`community catalog: ${url} (${cached.document.plugins.length} plugins, cached ${Math.round((now - cached.fetchedAt) / 1000)}s ago)`)
      return cached.document
    }
    try {
      const document = await readJson(url, timeoutMs, signal)
      if (!document || !Array.isArray(document.plugins)) throw new Error('unexpected document shape')
      catalogCache.set(url, { document, fetchedAt: Date.now() })
      preferredCatalogUrl = url
      notes.push(`community catalog: ${url} (${document.plugins.length} plugins, fetched now)`)
      return document
    } catch (error) {
      notes.push(`community catalog: ${url} failed (${describeError(error)})`)
    }
  }
  return undefined
}

/**
 * Gather every installable candidate from the sources this profile can reach.
 * @returns the merged candidates and the human-readable notes that describe them.
 */
export async function collectCandidates({ ctx, config, signal }) {
  const notes = []
  const byName = new Map()
  const put = (candidate) => {
    if (!candidate?.name) return
    const key = normalize(candidate.name)
    const existing = byName.get(key)
    byName.set(key, existing ? mergeCandidates(existing, candidate) : candidate)
  }

  const readService = (name) => {
    try {
      return typeof ctx?.get === 'function' ? ctx.get(name) : undefined
    } catch {
      return undefined
    }
  }

  const manager = readService('pluginManager')
  const installedByName = new Map()
  let officialCount = 0
  if (manager) {
    try {
      const [bundles, plugins] = await Promise.all([manager.listBundles(), manager.listPlugins()])
      for (const plugin of plugins ?? []) {
        if (plugin?.moduleName) installedByName.set(normalize(plugin.moduleName), Boolean(plugin.enabled))
      }
      for (const bundle of bundles ?? []) {
        if (!bundle?.name) continue
        const official = Boolean(bundle.official)
        if (official) officialCount += 1
        put({
          name: bundle.name,
          titleEn: pickLocalized(bundle.meta?.title, false),
          titleZh: pickLocalized(bundle.meta?.title, true),
          descEn: pickLocalized(bundle.meta?.description, false) || bundle.description || '',
          descZh: pickLocalized(bundle.meta?.description, true) || '',
          keywords: [],
          labels: official ? ['official'] : [],
          category: '',
          version: bundle.version ?? bundle.installTarget?.version,
          installSpec: bundle.installTarget?.spec,
          installed: Boolean(bundle.installed),
          enabled: Boolean(bundle.enabled),
          official,
          sourceLabel: official ? 'DSH built-in optional plugin' : 'installed in this profile',
          sourceRank: 3,
        })
      }
      notes.push(`this profile: ${installedByName.size} installed plugin row${installedByName.size === 1 ? '' : 's'}, ${officialCount} built-in optional bundle${officialCount === 1 ? '' : 's'}`)
    } catch (error) {
      notes.push(`this profile: could not be read (${describeError(error)})`)
    }
  } else {
    notes.push('this profile: no plugin manager, so installed and built-in plugins are unknown')
  }

  const market = readService('pluginMarket')
  let indexCandidates = 0
  if (!market) {
    notes.push('configured plugin indexes: plugin market is not mounted in this profile')
  } else {
    try {
      const indexes = market.listIndexes()
      if (!Array.isArray(indexes) || indexes.length === 0) {
        notes.push('configured plugin indexes: none — add one under Plugins → Discover → Index sources')
      } else {
        for (const summary of indexes) {
          const url = summary?.url
          if (!url) continue
          try {
            const page = await market.search(url, { text: config.need, sort: { kind: 'relevance' }, offset: 0, limit: 12 })
            const entries = page?.entries ?? []
            for (const entry of entries) {
              const version = entry.versions?.find((item) => item.version === entry.defaultVersion) ?? entry.versions?.[0]
              const categoryId = entry.metadata?.category ?? ''
              put({
                name: entry.name,
                titleEn: pickLocalized(entry.title, false),
                titleZh: pickLocalized(entry.title, true),
                descEn: pickLocalized(entry.description, false),
                descZh: pickLocalized(entry.description, true),
                keywords: entry.metadata?.keywords ?? [],
                labels: entry.metadata?.labels ?? [],
                category: categoryId,
                categoryTitleEn: pickLocalized(page?.metadata?.categories?.[categoryId]?.title, false),
                categoryTitleZh: pickLocalized(page?.metadata?.categories?.[categoryId]?.title, true),
                version: entry.defaultVersion,
                installSpec: version?.install?.spec,
                installed: Boolean(entry.installation && entry.installation.status !== 'not-installed'),
                enabled: false,
                installedVersion: entry.installation?.installedVersion,
                homepage: entry.homepage,
                sourceLabel: `plugin index (${url})`,
                sourceRank: 2,
              })
              indexCandidates += 1
            }
            const total = page?.total ?? entries.length
            notes.push(`plugin index ${url}: ${total} match${total === 1 ? '' : 'es'}`)
          } catch (error) {
            notes.push(`plugin index ${url}: search failed (${describeError(error)})`)
          }
        }
      }
    } catch (error) {
      notes.push(`configured plugin indexes: could not be read (${describeError(error)})`)
    }
  }

  if (indexCandidates < 3 && config.catalogFallback !== false) {
    const document = await loadCatalog(config, signal, notes)
    if (document) {
      for (const plugin of document.plugins) put(catalogCandidate(plugin, document, preferredCatalogUrl))
    }
  } else if (indexCandidates >= 3) {
    notes.push('community catalog: not queried — the configured indexes already answered')
  }

  for (const candidate of byName.values()) {
    const local = installedByName.get(normalize(candidate.name))
    if (local !== undefined) {
      candidate.installed = true
      candidate.enabled = candidate.enabled || local
    }
  }

  return { candidates: [...byName.values()], notes }
}
