window.__ModuleLoader__.load({
  id: 'dsh-market-recommender',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-market-recommender'
    const BASE = 'market-recommender'

    function api(path) {
      const relative = path.replace(/^\/+/, '')
      if (typeof document === 'undefined') return `/${relative}`
      return new URL(relative, document.baseURI).pathname
    }

    const DICT = {
      en: {
        nav: 'Recommend',
        heading: 'Want DSH to do something? Check the market first.',
        hint: 'Describe the outcome in one sentence. Searches the plugin indexes configured in this profile, the community dshmarket catalog, and the plugins built into DSH.',
        placeholder: 'e.g. remember my preferences across sessions',
        search: 'Search',
        searching: 'Searching…',
        needRequired: 'Type what you want to achieve.',
        failed: 'Request failed',
        sources: 'Sources searched',
        bestFirst: 'candidates, best first',
        nearOnly: 'No close match — nearest candidates only',
        noMatch: 'Nothing here is a real fit. Writing a small plugin is the better move.',
        install: 'Install',
        enable: 'Enable',
        working: 'Working…',
        done: 'Done',
        dialogOpened: 'Handed to the install dialog above',
        daily: "Today's picks",
        dailyHint: 'Three plugins from the community catalog, refreshed once a day.',
        restart: 'Restart DSH to activate it.',
        pendingBuild: 'This package wants to run build scripts; approve it in Plugins.',
        statusEnabled: 'Enabled',
        statusDisabled: 'Installed, not enabled — open it in Plugins',
        statusOfficial: 'Built into this installation, not enabled',
        statusMissing: 'Not installed',
        matched: 'matched',
        official: 'official',
      },
      zh: {
        nav: '推荐',
        heading: '想让 DSH 做什么？先看看市场里有没有',
        hint: '用一句话说明你想达到的效果。会搜索本 profile 配置的插件市场索引、社区 dshmarket 目录，以及 DSH 内置插件。',
        placeholder: '例如：跨会话记住我的偏好',
        search: '搜索',
        searching: '搜索中…',
        needRequired: '先写一句你想实现什么。',
        failed: '请求失败',
        sources: '搜索来源',
        bestFirst: ' 个候选，最相关在前',
        nearOnly: '没有真正匹配的，以下只是最接近的',
        noMatch: '这些都不算真正合适，更值得的做法是另写一个小插件。',
        install: '安装',
        enable: '启用',
        working: '处理中…',
        done: '完成',
        dialogOpened: '已交给上方安装对话框处理',
        daily: '今日推荐',
        dailyHint: '每天换三个社区插件，装上就能用。',
        restart: '需要重启 DSH 才会生效。',
        pendingBuild: '这个包需要执行构建脚本，请到插件页确认。',
        statusEnabled: '已启用',
        statusDisabled: '已安装但未启用 —— 去插件页打开',
        statusOfficial: '随本安装附带，尚未启用',
        statusMissing: '未安装',
        matched: '命中',
        official: '内置',
      },
    }

    function activeLanguage(locale) {
      let id = 'en'
      try {
        id = locale?.getLocale?.().active ?? locale?.getSnapshot?.()?.active ?? 'en'
      } catch {
        id = 'en'
      }
      const base = String(id).toLowerCase()
      return base.startsWith('zh') ? 'zh' : 'en'
    }

    function useRevision(locale) {
      const subscribe = React.useCallback(
        (notify) => (locale && typeof locale.subscribe === 'function' ? locale.subscribe(notify) : () => {}),
        [locale],
      )
      const snapshot = React.useCallback(() => {
        try {
          return locale?.getSnapshot?.()?.revision ?? 0
        } catch {
          return 0
        }
      }, [locale])
      return React.useSyncExternalStore(subscribe, snapshot, () => 0)
    }

    function statusOf(candidate, t) {
      if (candidate.enabled) return { text: t('statusEnabled'), tone: 'ok' }
      if (candidate.installed) return { text: t('statusDisabled'), tone: 'idle' }
      if (candidate.official) return { text: t('statusOfficial'), tone: 'idle' }
      return { text: t('statusMissing'), tone: 'idle' }
    }

    function actionOf(candidate) {
      if (candidate.enabled || candidate.installed) return undefined
      if (candidate.official) return 'enable'
      if (candidate.installSpec) return 'install'
      return undefined
    }

    function Panel({ locale, ownerProps }) {
      useRevision(locale)
      const t = React.useCallback((key) => {
        const language = activeLanguage(locale)
        const dict = DICT[language] ?? DICT.en
        return dict[key] ?? DICT.en[key] ?? key
      }, [locale])

      const [need, setNeed] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [result, setResult] = React.useState(null)
      const [error, setError] = React.useState('')
      const [acting, setActing] = React.useState('')
      const [notice, setNotice] = React.useState(null)
      const [daily, setDaily] = React.useState(null)

      React.useEffect(() => {
        let cancelled = false
        const language = activeLanguage(locale)
        fetch(api(`/${BASE}/daily?lang=${language}`))
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (!cancelled) setDaily(payload)
          })
          .catch(() => {
            if (!cancelled) setDaily(null)
          })
        return () => {
          cancelled = true
        }
      }, [locale])

      const search = React.useCallback(async () => {
        const trimmed = need.trim()
        if (trimmed.length === 0) {
          setError(t('needRequired'))
          return
        }
        setBusy(true)
        setError('')
        setNotice(null)
        try {
          const response = await fetch(api(`/${BASE}/search`), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ need: trimmed, limit: 8 }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
          setResult(payload)
        } catch (failure) {
          setResult(null)
          setError(`${t('failed')}: ${failure?.message ?? failure}`)
        } finally {
          setBusy(false)
        }
      }, [need, t])

      const act = React.useCallback(async (candidate, action) => {
        setActing(candidate.name)
        setNotice(null)
        try {
          // The Plugins page owns the install dialog; hand the spec to it when it
          // offers one, so progress and compatibility show where users expect them.
          if (action === 'install' && ownerProps && typeof ownerProps.install === 'function') {
            ownerProps.install({ spec: candidate.installSpec, label: candidate.name })
            setNotice({ candidate, payload: { application: 'dialog' } })
            return
          }
          const response = await fetch(api(`/${BASE}/act`), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: candidate.name,
              spec: candidate.installSpec,
              version: candidate.version,
              action,
            }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
          setNotice({ candidate, payload })
        } catch (failure) {
          setError(`${t('failed')}: ${failure?.message ?? failure}`)
        } finally {
          setActing('')
        }
      }, [t, ownerProps])

      const onKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          void search()
        }
      }

      const rows = result?.candidates ?? []

      return h('div', { className: 'dsmr-root' }, [
        h('style', { key: 'style' }, CSS),
        h('h3', { key: 'heading', className: 'dsmr-heading' }, t('heading')),
        h('p', { key: 'hint', className: 'dsmr-hint' }, t('hint')),
        h('div', { key: 'search', className: 'dsmr-search' }, [
          h('input', {
            key: 'input',
            className: 'dsmr-input',
            type: 'text',
            value: need,
            placeholder: t('placeholder'),
            'aria-label': t('heading'),
            onChange: (event) => setNeed(event.target.value),
            onKeyDown,
          }),
          h('button', {
            key: 'button',
            type: 'button',
            className: 'dsmr-primary',
            disabled: busy,
            onClick: () => void search(),
          }, busy ? t('searching') : t('search')),
        ]),
        error ? h('p', { key: 'error', className: 'dsmr-error', role: 'alert' }, error) : null,
        result
          ? h('div', { key: 'result', className: 'dsmr-result' }, [
            h('p', { key: 'verdict', className: 'dsmr-verdict' },
              result.matched
                ? `${rows.length}${t('bestFirst')}`
                : t('nearOnly')),
            result.notes?.length
              ? h('details', { key: 'notes', className: 'dsmr-notes' }, [
                h('summary', { key: 'summary' }, t('sources')),
                h('ul', { key: 'list' }, result.notes.map((note, index) => h('li', { key: index }, note))),
              ])
              : null,
            h('ul', { key: 'cards', className: 'dsmr-cards' },
              rows.map((candidate) => renderCard(candidate, t, acting, act))),
            result.matched ? null : h('p', { key: 'nomatch', className: 'dsmr-nomatch' }, t('noMatch')),
          ])
          : null,
        notice ? h('p', { key: 'notice', className: 'dsmr-notice', role: 'status' }, noticeText(notice, t)) : null,
        daily && Array.isArray(daily.picks) && daily.picks.length > 0
          ? h('section', { key: 'daily', className: 'dsmr-daily' }, [
            h('h4', { key: 'heading', className: 'dsmr-daily-heading' }, t('daily')),
            h('p', { key: 'hint', className: 'dsmr-hint' }, t('dailyHint')),
            h('ul', { key: 'cards', className: 'dsmr-cards' },
              daily.picks.map((candidate) => renderCard(candidate, t, acting, act))),
          ])
          : null,
      ])
    }

    function noticeText(notice, t) {
      const { payload } = notice
      if (payload?.application === 'dialog') return t('dialogOpened')
      if (payload?.error) return `${t('failed')}: ${payload.error.diagnostic || payload.error.code}`
      if (payload?.pendingBuilds?.length) return t('pendingBuild')
      if (payload?.application === 'restart-required') return `${t('done')} · ${t('restart')}`
      if (payload?.application === 'failed') return `${t('failed')}: ${payload?.error?.diagnostic ?? ''}`
      return t('done')
    }

    function renderCard(candidate, t, acting, act) {
      const status = statusOf(candidate, t)
      const action = actionOf(candidate)
      const busy = acting === candidate.name

      return h('li', { key: candidate.name, className: 'dsmr-card' }, [
        h('div', { key: 'head', className: 'dsmr-card-head' }, [
          h('span', { key: 'name', className: 'dsmr-name' }, candidate.name),
          candidate.official
            ? h('span', { key: 'badge', className: 'dsmr-badge' }, t('official'))
            : null,
          h('span', { key: 'status', className: `dsmr-status dsmr-tone-${status.tone}` }, status.text),
        ]),
        candidate.title && candidate.title !== candidate.name
          ? h('p', { key: 'title', className: 'dsmr-title' }, candidate.title)
          : null,
        candidate.description
          ? h('p', { key: 'description', className: 'dsmr-description' }, candidate.description)
          : null,
        h('div', { key: 'meta', className: 'dsmr-meta' }, [
          candidate.category ? h('span', { key: 'category' }, candidate.category) : null,
          candidate.keywords?.length
            ? h('span', { key: 'keywords' }, candidate.keywords.join(' · '))
            : null,
          candidate.matched?.length
            ? h('span', { key: 'matched', className: 'dsmr-matched' }, `${t('matched')}: ${candidate.matched.join(', ')}`)
            : null,
        ]),
        h('div', { key: 'foot', className: 'dsmr-foot' }, [
          candidate.installSpec || candidate.homepage
            ? h('code', { key: 'spec', className: 'dsmr-spec' }, candidate.installSpec || candidate.homepage)
            : h('span', { key: 'spec', className: 'dsmr-spec' }),
          action
            ? h('button', {
              key: 'action',
              type: 'button',
              className: 'dsmr-secondary',
              disabled: busy,
              onClick: () => void act(candidate, action),
            }, busy ? t('working') : t(action))
            : null,
        ]),
      ])
    }

    const CSS = `
.dsmr-root { display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsmr-heading { margin: 0; font-size: 15px; font-weight: 600; }
.dsmr-hint { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.dsmr-search { display: flex; gap: 8px; }
.dsmr-input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; }
.dsmr-input:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsmr-primary, .dsmr-secondary { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.dsmr-primary { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); font-weight: 600; }
.dsmr-primary:disabled, .dsmr-secondary:disabled { opacity: .55; cursor: default; }
.dsmr-error { margin: 0; color: var(--dsw-alias-state-error-primary); }
.dsmr-result { display: flex; flex-direction: column; gap: 10px; }
.dsmr-verdict { margin: 0; color: var(--dsw-alias-label-secondary); }
.dsmr-notes { color: var(--dsw-alias-label-secondary); }
.dsmr-notes ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.6; word-break: break-all; }
.dsmr-cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dsmr-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.dsmr-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsmr-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600; }
.dsmr-badge { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dsmr-status { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsmr-tone-ok { color: var(--dsw-alias-state-success-primary); }
.dsmr-title { margin: 0; font-weight: 600; }
.dsmr-description { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dsmr-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsmr-matched { color: var(--dsw-alias-state-idle-primary); }
.dsmr-foot { display: flex; align-items: center; gap: 10px; }
.dsmr-spec { flex: 1; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsmr-nomatch { margin: 0; font-weight: 600; }
.dsmr-notice { margin: 0; color: var(--dsw-alias-state-success-primary); }
.dsmr-daily { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsmr-daily-heading { margin: 0; font-size: 13px; font-weight: 600; }
`

    module.exports.inject = ['slots', 'locale']
    module.exports.apply = function apply(ctx) {
      try {
        const locale = ctx.locale
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register(NS, 'en', DICT.en)
            locale.register(NS, 'zh', DICT.zh)
          } catch {
            // A reload can reach this again before the previous dictionaries were
            // removed; the active namespace already carries the same texts.
          }
        }

        const navLabel = () => {
          const language = activeLanguage(locale)
          return (DICT[language] ?? DICT.en).nav
        }

        ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'dsh-market-recommender',
          order: 5,
          label: navLabel,
        }, (ownerProps) => h(Panel, { locale, ownerProps })))
      } catch (error) {
        console.error('dsh-market-recommender: client apply failed', error)
      }
    }
    return module.exports
  },
})
