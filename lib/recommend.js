import { buildQueryTerms, hasCjk, indexCandidate, normalize, pickLocalized, scoreCandidate } from './match.js'

/**
 * Score every candidate against one need.
 * @returns `strong` (real matches, best first) and `scored` (every positive score).
 */
export function rankCandidates({ candidates, need, synonyms = [], minScore = 7 }) {
  const terms = buildQueryTerms(need, synonyms)
  const normalizedNeed = normalize(need)
  const scored = []

  if (terms.size > 0) {
    for (const candidate of candidates) {
      const indexed = indexCandidate(candidate)
      let prefiltered = false
      for (const term of terms.keys()) {
        if (indexed.text.includes(term)) {
          prefiltered = true
          break
        }
      }
      if (!prefiltered) continue
      const result = scoreCandidate(terms, indexed, normalizedNeed)
      if (result.score <= 0) continue
      // A plugin already built into this installation costs no download and no
      // version check, so it wins a near tie against a community lookalike.
      scored.push({ candidate, ...result, score: result.score + (candidate.official ? 1.5 : 0) })
    }
  }

  scored.sort((left, right) => (
    right.score - left.score
    || Number(right.candidate.installed) - Number(left.candidate.installed)
  ))

  // A real match needs enough score *and* evidence in a name, title, keyword, or
  // across most of the need itself; two incidental description words are not a match.
  const strong = scored.filter((item) => (
    item.score >= minScore && (item.strongField >= 2.2 || item.literalCoverage >= 0.5)
  ))

  return { terms, scored, strong }
}

/**
 * Choose the rows to show: the best `limit` matches, plus a matching plugin that
 * ships with this installation when the visible list has none — it costs no
 * download and no compatibility guess, so it is never left out of sight.
 */
export function selectRows({ strong, scored, limit }) {
  const pool = (strong.length > 0 ? strong : scored).slice(0, limit)
  const extras = []
  if (strong.length > 0 && !pool.some((item) => item.candidate.official)) {
    const official = strong.find((item) => item.candidate.official)
    if (official) extras.push(official)
  }
  return { pool, extras, rows: [...pool, ...extras] }
}

/**
 * The JSON-safe view of one ranked candidate that the Plugins panel renders.
 * @param item - a ranked item from {@link rankCandidates}.
 * @param preferZh - whether the need was written in Chinese.
 */
export function publicCandidate(item, preferZh) {
  const { candidate } = item
  const title = preferZh
    ? candidate.titleZh || candidate.titleEn
    : candidate.titleEn || candidate.titleZh
  const description = preferZh
    ? candidate.descZh || candidate.descEn
    : candidate.descEn || candidate.descZh
  const category = preferZh
    ? candidate.categoryTitleZh || candidate.categoryTitleEn || candidate.category
    : candidate.categoryTitleEn || candidate.categoryTitleZh || candidate.category

  return {
    name: candidate.name,
    title: title || candidate.name,
    description: trimTo(description, 320),
    category: category || '',
    keywords: (candidate.keywords ?? []).slice(0, 6),
    installSpec: candidate.installSpec ?? '',
    version: candidate.version ?? '',
    installedVersion: candidate.installedVersion ?? '',
    homepage: candidate.homepage ?? '',
    official: Boolean(candidate.official),
    installed: Boolean(candidate.installed),
    enabled: Boolean(candidate.enabled),
    matched: item.matched.slice(0, 6).map(([term]) => term),
    preferZh,
  }
}

function trimTo(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export { pickLocalized }
