const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/

/** Bilingual concept groups: any hit pulls in the other spellings of that concept. */
export const DEFAULT_SYNONYM_GROUPS = [
  ['terminal', 'shell', 'bash', 'powershell', 'console', 'cli', '终端', '命令行', '控制台'],
  ['voice', 'speech', 'microphone', 'stt', 'asr', 'recording', '语音', '录音', '听写', '麦克风'],
  ['tts', 'speak', 'narration', '朗读', '播报', '配音'],
  ['theme', 'appearance', 'palette', 'dark', 'light', '主题', '外观', '配色', '暗色', '亮色'],
  ['browser', 'playwright', 'chromium', 'chrome', 'selenium', '浏览器', '网页', '网页自动化'],
  ['search', 'find', 'lookup', '检索', '搜索', '查找'],
  ['memory', 'remember', 'recall', '记忆', '回忆', '长期记忆'],
  ['schedule', 'reminder', 'cron', 'timer', '定时', '提醒', '定时任务'],
  ['task', 'todo', 'checklist', '待办', '任务', '清单'],
  ['git', 'worktree', 'branch', 'commit', '分支', '工作树', '代码管理'],
  ['session', 'history', 'transcript', '会话', '历史', '记录'],
  ['image', 'picture', 'vision', 'screenshot', 'ocr', '图片', '图像', '截图', '识别', '视觉'],
  ['translate', 'translation', 'translator', '翻译', '中英'],
  ['token', 'usage', 'cost', 'billing', 'quota', '用量', '计费', '成本', '额度'],
  ['model', 'provider', 'llm', 'api', '模型', '接入', '供应商'],
  ['backup', 'sync', 'export', 'import', '备份', '同步', '导出', '导入'],
  ['mobile', 'phone', 'remote', '手机', '移动端', '远程'],
  ['permission', 'approval', 'security', '授权', '权限', '审批', '安全'],
  ['skill', 'prompt', '技能', '提示词'],
  ['mcp', 'server', '工具协议'],
  ['status', 'indicator', 'badge', '状态栏', '指示', '徽章'],
  ['document', 'docs', 'pdf', 'markdown', 'word', 'excel', '文档', '表格', '渲染'],
  ['notification', 'alert', '通知', '提醒'],
  ['shortcut', 'hotkey', 'keybinding', '快捷键', '热键'],
]

/** Lowercase and normalize a value for matching. */
export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
}

/** Whether the text contains any CJK character. */
export function hasCjk(value) {
  return CJK.test(String(value ?? ''))
}

/** Cut a value to a maximum length, marking the cut explicitly. */
export function trim(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** Pick the text of one localized value in the requested display language. */
export function pickLocalized(value, preferZh) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (preferZh && typeof value.zh === 'string' && value.zh.length > 0) return value.zh
  if (typeof value.en === 'string' && value.en.length > 0) return value.en
  const first = Object.values(value).find((entry) => typeof entry === 'string' && entry.length > 0)
  return first ?? ''
}

/** Words that every entry shares, so they say nothing about this need. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'to', 'in', 'on', 'of', 'and', 'or', 'but', 'with', 'without',
  'my', 'me', 'i', 'we', 'you', 'it', 'is', 'are', 'was', 'be', 'been', 'can', 'could',
  'should', 'would', 'do', 'does', 'did', 'how', 'what', 'which', 'when', 'where', 'why',
  'want', 'wants', 'need', 'needs', 'like', 'get', 'make', 'let', 'please', 'some', 'any',
  'this', 'that', 'these', 'those', 'from', 'at', 'by', 'as', 'so', 'if', 'then', 'than',
  'there', 'here', 'have', 'has', 'had', 'will', 'just', 'also', 'more', 'most', 'very',
  'about', 'into', 'dsh', 'deepseek', 'harness', 'plugin', 'plugins', 'extension', 'extensions',
])

/** Chinese bigrams that behave like stopwords in this catalog. */
const CJK_STOP_BIGRAMS = new Set([
  '一个', '一下', '可以', '怎么', '如何', '帮我', '我想', '想要', '需要', '的话',
  '什么', '有没', '没有', '支持', '能不', '就是', '这个', '那个', '现在', '然后',
])

function asciiWords(text) {
  return normalize(text)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((word) => word.length >= 2 && !CJK.test(word))
}

function cjkBigrams(text) {
  const source = normalize(text)
  const out = new Set()
  for (let index = 0; index + 1 < source.length; index += 1) {
    if (CJK.test(source[index]) && CJK.test(source[index + 1])) {
      out.add(source[index] + source[index + 1])
    }
  }
  return out
}

/**
 * Turn a natural-language need into weighted query terms: its own words plus the
 * other spellings of every concept it names.
 * @param need - what the user wants to achieve.
 * @param extraGroups - additional concept groups from Config.
 * @returns term → weight, where expansion terms weigh less than literal ones.
 */
export function buildQueryTerms(need, extraGroups = []) {
  const terms = new Map()
  const add = (term, weight) => {
    if (!term) return
    if (!terms.has(term) || (terms.get(term) ?? 0) < weight) terms.set(term, weight)
  }

  for (const word of asciiWords(need)) {
    if (!STOPWORDS.has(word)) add(word, 1)
  }
  for (const bigram of cjkBigrams(need)) {
    if (!CJK_STOP_BIGRAMS.has(bigram)) add(bigram, 1)
  }

  const groups = [...DEFAULT_SYNONYM_GROUPS, ...(Array.isArray(extraGroups) ? extraGroups : [])]
  const literal = [...terms.keys()]
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) continue
    const normalized = group.map((entry) => normalize(entry)).filter((entry) => entry.length > 0)
    const hit = literal.some((term) => normalized.some((entry) => {
      if (CJK.test(entry) || CJK.test(term)) return term.includes(entry) || entry.includes(term)
      return term === entry
    }))
    if (!hit) continue
    for (const entry of normalized) add(entry, 0.55)
  }

  return terms
}

/** The joined searchable text of a candidate, for a cheap prefilter. */
export function candidateText(candidate) {
  return normalize([
    candidate.name,
    candidate.titleEn,
    candidate.titleZh,
    (candidate.keywords ?? []).join(' '),
    (candidate.labels ?? []).join(' '),
    candidate.category,
    candidate.categoryTitleEn,
    candidate.categoryTitleZh,
    candidate.descEn,
    candidate.descZh,
  ].join(' '))
}

const FIELD_WEIGHTS = { name: 3, title: 2.6, keywords: 2.2, desc: 1.2, category: 0.8 }

/** Weighted terms that must match before the coverage part of the score is full. */
const COVERAGE_CAP = 5

function wordSet(text) {
  const set = new Set()
  for (const word of asciiWords(text)) {
    set.add(word)
    if (word.endsWith('s')) set.add(word.slice(0, -1))
  }
  return set
}

/** Prepare one candidate for scoring. */
export function indexCandidate(candidate) {
  const name = normalize(candidate.name)
  const title = normalize(`${candidate.titleEn ?? ''} ${candidate.titleZh ?? ''}`)
  const keywords = normalize([...(candidate.keywords ?? []), ...(candidate.labels ?? [])].join(' '))
  const desc = normalize(`${candidate.descEn ?? ''} ${candidate.descZh ?? ''}`)
  const category = normalize(`${candidate.category ?? ''} ${candidate.categoryTitleEn ?? ''} ${candidate.categoryTitleZh ?? ''}`)
  return {
    text: candidateText(candidate),
    fields: [
      ['name', name, wordSet(name)],
      ['title', title, wordSet(title)],
      ['keywords', keywords, wordSet(keywords)],
      ['desc', desc, wordSet(desc)],
      ['category', category, wordSet(category)],
    ],
  }
}

function fieldMatches(term, text, words) {
  if (CJK.test(term)) return text.includes(term)
  if (words.has(term)) return true
  // A plural or a possessive must still match its stem.
  return term.length >= 4 && words.has(term.slice(0, -1))
}

/**
 * Score one indexed candidate against the query terms.
 * @returns the score, the matched share of the query, and the matched terms.
 */
export function scoreCandidate(terms, indexed, normalizedNeed) {
  const entries = [...terms.entries()]
  let fieldScore = 0
  let covered = 0
  let literalTotal = 0
  let literalMatched = 0
  let strongField = 0
  const matched = []

  for (const [term, weight] of entries) {
    if (weight >= 1) literalTotal += 1
    let best = 0
    for (const [field, text, words] of indexed.fields) {
      if (fieldMatches(term, text, words)) best = Math.max(best, FIELD_WEIGHTS[field] ?? 0)
    }
    if (best > 0) {
      fieldScore += weight * best
      covered += weight
      if (weight >= 1) literalMatched += 1
      strongField = Math.max(strongField, best)
      matched.push([term, best])
    }
  }

  // Stronger fields first, so the incidental matches fall off the display cap.
  matched.sort((left, right) => right[1] - left[1])

  // A long need has many terms, most of them incidental; cap the coverage the
  // same way for every need so a length does not depress an otherwise good match.
  const ratio = Math.min(covered, COVERAGE_CAP) / COVERAGE_CAP
  let score = ratio * 12 + fieldScore
  if (normalizedNeed.length >= 4 && indexed.text.includes(normalizedNeed)) score += 6
  return {
    score,
    ratio,
    matched,
    strongField,
    literalCoverage: literalTotal > 0 ? literalMatched / literalTotal : 0,
  }
}
