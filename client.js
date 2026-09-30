// Skill-library manager — Client Web UI.
//
// Registers a sidebar entry (sidebar.panellist) and a keyed main panel (main)
// that together form the "技能库" management surface. The panel lists every
// skill discovered across the machine, de-duplicated, grouped by category, with
// search, per-tool filters, a detail drawer, safe delete-to-trash (+ restore),
// custom categories, local/Git install, and Markdown/CSV/JSON export.
//
// Design notes (per the Harness plugin UI practices):
//  * Plain React from the browser module table — no @deepseek-ai/dsh-client-ui-* import.
//  * All styling uses --dsw-alias-* theme tokens so the panel matches light/dark.
//  * All visible text is routed through the Client locale service (zh + en).
//  * Every host call re-fetches after a mutation; there are no pushed host events.
//
// The panel talks to the Host through ctx.remote.skillManager, whose typed
// namespace is mounted here from the hand-written Remote descriptors (mirroring
// the Host's @Remote surface in index.js).

window.__ModuleLoader__.load({
  id: '@local/skill-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    const NAMESPACE = 'skillManager'
    const PANEL_ID = 'skills'
    const NS = 'skillManager'
    const PKG = '@local/skill-manager'

    //#region Remote descriptors (mirror of the Host @Remote surface)
    const passthrough = () => ({ parse: (v) => v, safeParse: (v) => ({ success: true, data: v }) })
    const codec = (typeSymbol) => ({ mode: 'strict', typeSymbol, create: passthrough })
    const requestParam = (method) => ({ name: 'request', wire: 'request', source: 'json', codec: codec(`${PKG}#${method}:request`) })
    const resultCodec = (method) => codec(`${PKG}#${method}:result`)
    function descriptor(method, opts = {}) {
      const params = opts.params === false ? [] : [requestParam(method)]
      const entry = {
        id: `${PKG}#${NAMESPACE}/${method}`,
        service: NAMESPACE,
        namespace: NAMESPACE,
        method,
        invocation: { kind: 'direct' },
        parameters: params,
        result: resultCodec(method),
      }
      if (opts.cancel !== false) entry.cancellation = { parameter: 'signal' }
      return entry
    }
    const TYPERT_REMOTE = {
      package: PKG,
      descriptors: [
        descriptor('roots', { params: false }),
        descriptor('scan', { params: false }),
        descriptor('refresh', { params: false }),
        descriptor('updateCategory'),
        descriptor('createCategory'),
        descriptor('renameCategory'),
        descriptor('deleteCategory'),
        descriptor('setAlias'),
        descriptor('setFavorite'),
        descriptor('configure'),
        descriptor('deleteSkill'),
        descriptor('trashList', { params: false }),
        descriptor('restore'),
        descriptor('purge'),
        descriptor('validateSource'),
        descriptor('installLocal'),
        descriptor('installGit'),
        descriptor('revealPath'),
        descriptor('exportCatalog'),
        descriptor('skillDetail'),
      ],
    }
    //#endregion

    //#region locale
    const zh = {
      panel: '技能库',
      title: '技能库',
      subtitle: '全机器技能聚合 · 去重 · 分类管理',
      search: '搜索技能…',
      allCategories: '全部分类',
      allTools: '全部来源',
      refresh: '刷新',
      refreshing: '扫描中…',
      add: '添加技能',
      manageCats: '管理分类',
      export: '导出',
      trash: '回收站',
      close: '关闭',
      cancel: '取消',
      confirm: '确定',
      save: '保存',
      loading: '正在扫描全机技能…',
      loadError: '扫描失败',
      retry: '重试',
      empty: '没有匹配的技能。',
      installedAt: '装于',
      sites: '处安装',
      conflict: '冲突',
      readOnly: '只读',
      favorite: '收藏',
      setCategory: '设为分类',
      autoCategory: '自动分类',
      reveal: '在文件夹中显示',
      detail: '详情',
      back: '返回列表',
      deleteSkill: '删除',
      deleteAll: '全部删除',
      deleteOne: '删除这一个',
      deleteConfirm: '将移入回收站（可恢复），确认删除「{name}」？',
      deleteOneConfirm: '将「{name}」的这一处安装移入回收站（可恢复），确认？',
      noDelete: '该技能所有安装位置均为只读，无法删除。',
      confirmTitle: '确认删除',
      installTitle: '添加技能',
      installLocal: '本地文件夹',
      installGit: 'Git 仓库',
      sourcePath: '源文件夹路径',
      gitUrl: 'Git 仓库地址',
      gitRef: '分支 / tag（可选）',
      targetRoot: '安装到',
      install: '安装',
      installing: '安装中…',
      installOk: '安装成功',
      installFail: '安装失败',
      exportTitle: '导出清单',
      exportJson: 'JSON',
      exportMd: 'Markdown',
      exportCsv: 'CSV (Excel)',
      catTitle: '管理分类',
      newCat: '新建分类',
      renameCat: '重命名',
      deleteCat: '删除分类',
      catName: '分类名称',
      trashTitle: '回收站',
      trashEmpty: '回收站是空的。',
      restore: '恢复',
      purge: '彻底删除',
      purgeConfirm: '将彻底删除该回收项（不可恢复），确认？',
      stats: '{tools} 个工具 · {skills} 个技能 · {inst} 处安装 · {conflicts} 冲突',
      noSelection: '选择左侧一个分类，或在右侧搜索全部技能。',
      toolFilter: '来源',
      addRoot: '添加扫描路径',
      removeRoot: '移除',
      rootsTitle: '扫描路径',
      includePluginCache: '包含 Claude 插件市场缓存（只读）',
      body: '正文',
      frontmatter: 'Frontmatter',
      tools: '来源',
    }
    const en = {
      panel: 'Skills',
      title: 'Skill Library',
      subtitle: 'Machine-wide skills · de-duplicated · categorized',
      search: 'Search skills…',
      allCategories: 'All categories',
      allTools: 'All sources',
      refresh: 'Refresh',
      refreshing: 'Scanning…',
      add: 'Add skill',
      manageCats: 'Categories',
      export: 'Export',
      trash: 'Trash',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      loading: 'Scanning machine skills…',
      loadError: 'Scan failed',
      retry: 'Retry',
      empty: 'No matching skills.',
      installedAt: 'Installed in',
      sites: 'installations',
      conflict: 'conflict',
      readOnly: 'read-only',
      favorite: 'Favorite',
      setCategory: 'Category',
      autoCategory: 'Auto',
      reveal: 'Show in folder',
      detail: 'Detail',
      back: 'Back to list',
      deleteSkill: 'Delete',
      deleteAll: 'Delete all',
      deleteOne: 'Delete this one',
      deleteConfirm: 'Move "{name}" to trash (recoverable). Continue?',
      deleteOneConfirm: 'Move this installation of "{name}" to trash (recoverable). Continue?',
      noDelete: 'All installations of this skill are read-only.',
      confirmTitle: 'Confirm delete',
      installTitle: 'Add skill',
      installLocal: 'Local folder',
      installGit: 'Git repository',
      sourcePath: 'Source folder path',
      gitUrl: 'Git repository URL',
      gitRef: 'Branch / tag (optional)',
      targetRoot: 'Install into',
      install: 'Install',
      installing: 'Installing…',
      installOk: 'Installed',
      installFail: 'Install failed',
      exportTitle: 'Export catalog',
      exportJson: 'JSON',
      exportMd: 'Markdown',
      exportCsv: 'CSV (Excel)',
      catTitle: 'Manage categories',
      newCat: 'New category',
      renameCat: 'Rename',
      deleteCat: 'Delete category',
      catName: 'Category name',
      trashTitle: 'Trash',
      trashEmpty: 'Trash is empty.',
      restore: 'Restore',
      purge: 'Delete forever',
      purgeConfirm: 'Permanently delete this trash item (irreversible). Continue?',
      stats: '{tools} tools · {skills} skills · {inst} installations · {conflicts} conflicts',
      noSelection: 'Pick a category on the left, or search all skills on the right.',
      toolFilter: 'Source',
      addRoot: 'Add scan path',
      removeRoot: 'Remove',
      rootsTitle: 'Scan paths',
      includePluginCache: 'Include Claude plugin cache (read-only)',
      body: 'Body',
      frontmatter: 'Frontmatter',
      tools: 'Sources',
    }
    //#endregion

    //#region styles (theme tokens only)
    const CSS = `
.smx-root{box-sizing:border-box;height:100%;display:flex;flex-direction:column;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.5}
.smx-root *,.smx-root *::before,.smx-root *::after{box-sizing:inherit}
.smx-toolbar{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex-wrap:wrap}
.smx-title{font-size:15px;font-weight:600;margin:0;white-space:nowrap}
.smx-sub{color:var(--dsw-alias-label-secondary);font-size:12px;margin:0;white-space:nowrap}
.smx-spacer{flex:1}
.smx-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.smx-btn:hover{border-color:var(--dsw-alias-label-tertiary,var(--dsw-alias-brand-primary))}
.smx-btn:disabled{opacity:.5;cursor:default}
.smx-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.smx-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.smx-input{height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;outline:none;min-width:0}
.smx-input:focus{border-color:var(--dsw-alias-brand-primary)}
.smx-select{height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px}
.smx-body{flex:1;display:flex;min-height:0}
.smx-side{flex:none;width:220px;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;padding:8px;background:var(--dsw-alias-bg-layer-1)}
.smx-side h3{margin:8px 6px 4px;font-size:12px;color:var(--dsw-alias-label-secondary);font-weight:600}
.smx-cat{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.smx-cat:hover{background:var(--dsw-alias-bg-layer-2)}
.smx-cat.active{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.smx-cat .count{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px}
.smx-main{flex:1;display:flex;min-width:0}
.smx-list{flex:1;overflow:auto;padding:8px;min-width:0}
.smx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}
.smx-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px;display:flex;flex-direction:column;gap:6px;cursor:pointer}
.smx-card:hover{border-color:var(--dsw-alias-brand-primary)}
.smx-card.sel{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset}
.smx-card h4{margin:0;font-size:14px;display:flex;align-items:center;gap:6px}
.smx-card .id{color:var(--dsw-alias-label-secondary);font-size:12px;word-break:break-all}
.smx-card .desc{color:var(--dsw-alias-label-secondary);font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.smx-badges{display:flex;gap:4px;flex-wrap:wrap}
.smx-badge{font-size:11px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.smx-badge.cat{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.smx-badge.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.smx-badge.err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.smx-badge.ro{color:var(--dsw-alias-label-secondary)}
.smx-detail{flex:none;width:380px;border-left:1px solid var(--dsw-alias-border-l1);overflow:auto;padding:12px;background:var(--dsw-alias-bg-layer-1)}
.smx-detail h3{margin:0 0 4px;font-size:15px}
.smx-detail .sec{margin-top:12px}
.smx-detail .sec h5{margin:0 0 4px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.smx-detail pre{white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;font-size:12px;max-height:280px;overflow:auto;margin:0}
.smx-inst{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;margin-bottom:6px;background:var(--dsw-alias-bg-layer-2);font-size:12px}
.smx-inst .path{color:var(--dsw-alias-label-secondary);word-break:break-all;margin:2px 0}
.smx-status{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;flex-wrap:wrap}
.smx-error{color:var(--dsw-alias-state-error-primary)}
.smx-center{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}
.smx-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000}
.smx-modal{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(520px,92vw);max-height:86vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.smx-modal h3{margin:0 0 10px;font-size:15px}
.smx-field{margin-bottom:10px;display:flex;flex-direction:column;gap:4px}
.smx-field label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.smx-field .smx-input,.smx-field .smx-select{width:100%}
.smx-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.smx-tab{padding:5px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}
.smx-tab.active{background:var(--dsw-alias-brand-primary);color:#fff;border-color:var(--dsw-alias-brand-primary)}
.smx-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.smx-note{color:var(--dsw-alias-label-secondary);font-size:12px;margin:4px 0}
.smx-pre{white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;font-size:12px;max-height:50vh;overflow:auto}
.smx-trash-item{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;margin-bottom:6px;background:var(--dsw-alias-bg-layer-2);font-size:12px}
`
    const STYLE_ID = '@local/skill-manager/SkillManager.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(STYLE_ID) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = PKG
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
    //#endregion

    //#region helpers
    function unwrap(result) {
      // Remote calls resolve to { ok, value } | { ok:false, error }.
      if (result && result.ok) return { value: result.value }
      const message = result?.error?.message ?? 'unknown error'
      const code = result?.error?.code
      return { error: code ? `${code}: ${message}` : message }
    }
    function Modal({ title, onClose, children, footer }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', { className: 'smx-modal-bg', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
        h('div', { className: 'smx-modal', role: 'dialog', 'aria-modal': 'true' },
          h('h3', null, title),
          children,
          footer ? h('div', { className: 'smx-row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, footer) : null,
        ),
      )
    }
    //#endregion

    //#region sub-views
    function InstallDialog({ api, roots, onClose, onDone, t }) {
      const [mode, setMode] = useState('local')
      const [source, setSource] = useState('')
      const [url, setUrl] = useState('')
      const [ref, setRef] = useState('')
      const editableRoots = roots.filter((r) => r.present && !r.readOnly)
      const [target, setTarget] = useState(editableRoots[0]?.path ?? '')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const doInstall = useCallback(async () => {
        setBusy(true); setErr('')
        let r
        if (mode === 'local') {
          if (!source || !target) { setErr('missing input'); setBusy(false); return }
          r = await api.installLocal({ path: source, targetRoot: target })
        } else {
          if (!url || !target) { setErr('missing input'); setBusy(false); return }
          r = await api.installGit({ url, ref: ref || undefined, targetRoot: target })
        }
        setBusy(false)
        if (r.error) { setErr(r.error); return }
        onDone(r.value)
        onClose()
      }, [api, mode, source, url, ref, target, onDone, onClose])
      return h(Modal, { title: t('installTitle'), onClose, footer: [
        h('button', { key: 'c', className: 'smx-btn', onClick: onClose }, t('cancel')),
        h('button', { key: 'i', className: 'smx-btn primary', disabled: busy, onClick: doInstall }, busy ? t('installing') : t('install')),
      ] },
        h('div', { className: 'smx-tabs' },
          h('button', { className: 'smx-tab' + (mode === 'local' ? ' active' : ''), onClick: () => setMode('local') }, t('installLocal')),
          h('button', { className: 'smx-tab' + (mode === 'git' ? ' active' : ''), onClick: () => setMode('git') }, t('installGit')),
        ),
        mode === 'local'
          ? h('div', { className: 'smx-field' }, h('label', null, t('sourcePath')), h('input', { className: 'smx-input', value: source, onChange: (e) => setSource(e.target.value), placeholder: 'C:\\path\\to\\skill' }))
          : h(React.Fragment, null,
            h('div', { className: 'smx-field' }, h('label', null, t('gitUrl')), h('input', { className: 'smx-input', value: url, onChange: (e) => setUrl(e.target.value), placeholder: 'https://github.com/org/repo' })),
            h('div', { className: 'smx-field' }, h('label', null, t('gitRef')), h('input', { className: 'smx-input', value: ref, onChange: (e) => setRef(e.target.value) })),
          ),
        h('div', { className: 'smx-field' },
          h('label', null, t('targetRoot')),
          h('select', { className: 'smx-select', value: target, onChange: (e) => setTarget(e.target.value) },
            editableRoots.map((r) => h('option', { key: r.path, value: r.path }, `${r.tool} — ${r.path}`)),
          ),
        ),
        err ? h('div', { className: 'smx-error smx-note' }, err) : null,
      )
    }

    function CategoryDialog({ api, categories, onClose, onDone, t }) {
      const [name, setName] = useState('')
      const [msg, setMsg] = useState('')
      const userCats = categories.filter((c) => c.source === 'user')
      const add = async () => {
        if (!name.trim()) return
        const r = await api.createCategory({ label: name.trim() })
        if (r.error) { setMsg(r.error); return }
        setName(''); onDone(r.value?.categories)
      }
      return h(Modal, { title: t('catTitle'), onClose, footer: [h('button', { key: 'c', className: 'smx-btn', onClick: onClose }, t('close'))] },
        h('div', { className: 'smx-field' }, h('label', null, t('newCat')),
          h('div', { className: 'smx-row' },
            h('input', { className: 'smx-input', value: name, onChange: (e) => setName(e.target.value), placeholder: t('catName') }),
            h('button', { className: 'smx-btn', onClick: add }, t('confirm')),
          ),
        ),
        msg ? h('div', { className: 'smx-error smx-note' }, msg) : null,
        h('div', { className: 'smx-sec' },
          h('h5', null, t('catTitle')),
          userCats.length === 0 ? h('div', { className: 'smx-note' }, '—') : userCats.map((c) =>
            h('div', { key: c.id, className: 'smx-trash-item' },
              h('div', { className: 'smx-row' },
                h('span', { style: { flex: '1' } }, c.label),
                h('button', { className: 'smx-btn danger', onClick: async () => { const r = await api.deleteCategory({ name: c.id }); if (!r.error) onDone(r.value?.categories) } }, t('deleteCat')),
              ),
            ),
          ),
        ),
      )
    }

    function TrashDialog({ api, onClose, onDone, t }) {
      const [entries, setEntries] = useState(null)
      const [msg, setMsg] = useState('')
      const load = useCallback(async () => { const r = await api.trashList(); if (r.error) setMsg(r.error); else setEntries(r.value.entries) }, [api])
      useEffect(() => { load() }, [load])
      return h(Modal, { title: t('trashTitle'), onClose, footer: [h('button', { key: 'c', className: 'smx-btn', onClick: onClose }, t('close'))] },
        msg ? h('div', { className: 'smx-error smx-note' }, msg) : null,
        entries === null ? h('div', { className: 'smx-note' }, '…') :
          entries.length === 0 ? h('div', { className: 'smx-note' }, t('trashEmpty')) :
          entries.map((e) => h('div', { key: e.trashPath, className: 'smx-trash-item' },
            h('div', null, `${e.tool} · ${e.from}`),
            h('div', { className: 'smx-row', style: { marginTop: '6px' } },
              h('button', { className: 'smx-btn', onClick: async () => { const r = await api.restore({ trashPath: e.trashPath }); if (!r.error) { load(); onDone(r.value?.catalog) } } }, t('restore')),
              h('button', { className: 'smx-btn danger', onClick: async () => { if (!window.confirm(t('purgeConfirm'))) return; const r = await api.purge({ trashPath: e.trashPath }); if (!r.error) load() } }, t('purge')),
            ),
          )),
      )
    }

    function ExportDialog({ api, onClose, t }) {
      const [out, setOut] = useState('')
      const run = async (format) => {
        const r = await api.exportCatalog({ format })
        if (r.error) { setOut(r.error); return }
        setOut(r.value.content)
        try { const blob = new Blob([r.value.content], { type: r.value.mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = r.value.filename; a.click(); URL.revokeObjectURL(a.href) } catch { /* preview only */ }
      }
      return h(Modal, { title: t('exportTitle'), onClose, footer: [h('button', { key: 'c', className: 'smx-btn', onClick: onClose }, t('close'))] },
        h('div', { className: 'smx-tabs' },
          h('button', { className: 'smx-tab', onClick: () => run('md') }, t('exportMd')),
          h('button', { className: 'smx-tab', onClick: () => run('csv') }, t('exportCsv')),
          h('button', { className: 'smx-tab', onClick: () => run('json') }, t('exportJson')),
        ),
        out ? h('pre', { className: 'smx-pre' }, out) : h('div', { className: 'smx-note' }, '…'),
      )
    }
    //#endregion

    //#region main panel
    function SkillManagerPanel({ api, t }) {
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [cat, setCat] = useState('all')
      const [tool, setTool] = useState('all')
      const [selected, setSelected] = useState(null)
      const [detail, setDetail] = useState(null)
      const [dialog, setDialog] = useState(null) // 'install' | 'cat' | 'trash' | 'export' | null
      const [notice, setNotice] = useState('')

      const load = useCallback(async () => {
        setLoading(true)
        const r = await api.refresh()
        setLoading(false)
        if (r.error) { setError(r.error); return }
        setError('')
        setData(r.value)
      }, [api])

      useEffect(() => { load() }, [load])

      const skills = data?.skills ?? []
      const categories = data?.categories ?? []
      const stats = data?.stats
      const tools = useMemo(() => {
        const set = new Set()
        for (const s of skills) for (const tool of s.tools) set.add(tool)
        return [...set].sort()
      }, [skills])

      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return skills.filter((s) => {
          if (cat !== 'all' && s.category !== cat) return false
          if (tool !== 'all' && !s.tools.includes(tool)) return false
          if (q && !(`${s.name} ${s.id} ${s.description}`.toLowerCase().includes(q))) return false
          return true
        })
      }, [skills, cat, tool, query])

      const openDetail = useCallback(async (s) => {
        setSelected(s)
        const r = await api.skillDetail({ name: s.id })
        setDetail(r.error ? { skill: s, frontmatter: '', body: '' } : r.value)
      }, [api])

      const doDelete = useCallback(async (skill, installKey) => {
        const msg = installKey ? t('deleteOneConfirm', { name: skill.name }) : t('deleteConfirm', { name: skill.name })
        if (!window.confirm(msg)) return
        const r = await api.deleteSkill({ name: skill.id, installKey })
        if (r.error) { setNotice(r.error); return }
        setSelected(null); setDetail(null)
        if (r.value?.catalog) setData(r.value.catalog); else load()
      }, [api, load, t])

      const setSkillCategory = useCallback(async (skill, category) => {
        const r = await api.updateCategory({ name: skill.id, category: category === 'auto' ? '' : category })
        if (r.error) { setNotice(r.error); return }
        load()
      }, [api, load])

      const catLabel = (id) => categories.find((c) => c.id === id)?.label ?? id

      // status bar
      const status = stats
        ? t('stats', { tools: stats.toolCount, skills: stats.uniqueSkills, inst: stats.installations, conflicts: stats.conflicts })
        : ''

      return h('div', { className: 'smx-root' },
        // toolbar
        h('div', { className: 'smx-toolbar' },
          h('h2', { className: 'smx-title' }, t('title')),
          h('span', { className: 'smx-sub' }, t('subtitle')),
          h('span', { className: 'smx-spacer' }),
          h('input', { className: 'smx-input', style: { width: '200px' }, value: query, placeholder: t('search'), onChange: (e) => setQuery(e.target.value) }),
          h('select', { className: 'smx-select', value: tool, onChange: (e) => setTool(e.target.value) },
            h('option', { value: 'all' }, t('allTools')),
            tools.map((x) => h('option', { key: x, value: x }, x)),
          ),
          h('button', { className: 'smx-btn', disabled: loading, onClick: load }, loading ? t('refreshing') : t('refresh')),
          h('button', { className: 'smx-btn primary', onClick: () => setDialog('install') }, t('add')),
          h('button', { className: 'smx-btn', onClick: () => setDialog('cat') }, t('manageCats')),
          h('button', { className: 'smx-btn', onClick: () => setDialog('trash') }, t('trash')),
          h('button', { className: 'smx-btn', onClick: () => setDialog('export') }, t('export')),
        ),

        // body
        h('div', { className: 'smx-body' },
          // category sidebar
          h('div', { className: 'smx-side' },
            h('h3', null, t('allCategories')),
            h('button', { className: 'smx-cat' + (cat === 'all' ? ' active' : ''), onClick: () => setCat('all') },
              h('span', null, t('allCategories')), h('span', { className: 'count' }, skills.length)),
            categories.map((c) => h('button', { key: c.id, className: 'smx-cat' + (cat === c.id ? ' active' : ''), onClick: () => setCat(c.id) },
              h('span', null, c.label), h('span', { className: 'count' }, c.count))),
          ),
          // list + detail
          h('div', { className: 'smx-main' },
            h('div', { className: 'smx-list' },
              error ? h('div', { className: 'smx-error' }, t('loadError') + ': ' + error) :
              loading && skills.length === 0 ? h('div', { className: 'smx-center' }, t('loading')) :
              filtered.length === 0 ? h('div', { className: 'smx-center' }, t('empty')) :
              h('div', { className: 'smx-grid' }, filtered.map((s) => h('div', { key: s.id, className: 'smx-card' + (selected?.id === s.id ? ' sel' : ''), onClick: () => openDetail(s) },
                h('h4', null, s.alias || s.name, s.conflict ? h('span', { className: 'smx-badge warn' }, '⚠ ' + t('conflict')) : null),
                h('div', { className: 'id' }, s.id),
                s.description ? h('div', { className: 'desc' }, s.description) : null,
                h('div', { className: 'smx-badges' },
                  h('span', { className: 'smx-badge cat' }, catLabel(s.category)),
                  s.tools.map((toolName) => h('span', { key: toolName, className: 'smx-badge' }, toolName)),
                  s.installCount > 1 ? h('span', { className: 'smx-badge' }, `${s.installCount} ${t('sites')}`) : null,
                  s.readOnly ? h('span', { className: 'smx-badge ro' }, '🔒 ' + t('readOnly')) : null,
                ),
              ))),
            ),
            // detail drawer
            detail ? h('div', { className: 'smx-detail' },
              h('div', { className: 'smx-row' },
                h('h3', { style: { flex: '1' } }, detail.skill.alias || detail.skill.name),
                h('button', { className: 'smx-btn', onClick: () => { setDetail(null); setSelected(null) } }, t('close')),
              ),
              h('div', { className: 'smx-note' }, detail.skill.id),
              detail.skill.description ? h('p', null, detail.skill.description) : null,
              h('div', { className: 'sec' },
                h('h5', null, t('setCategory')),
                h('select', { className: 'smx-select', value: detail.skill.category, onChange: (e) => setSkillCategory(detail.skill, e.target.value) },
                  h('option', { value: 'auto' }, t('autoCategory')),
                  categories.map((c) => h('option', { key: c.id, value: c.id }, c.label)),
                ),
              ),
              h('div', { className: 'sec' },
                h('h5', null, `${t('installedAt')} (${detail.skill.installCount})`),
                detail.skill.installations.map((i) => h('div', { key: i.key, className: 'smx-inst' },
                  h('div', { className: 'smx-row' },
                    h('span', { style: { flex: '1' } }, i.tool),
                    h('button', { className: 'smx-btn', onClick: () => api.revealPath({ path: i.path }) }, t('reveal')),
                    i.editable ? h('button', { className: 'smx-btn danger', onClick: () => doDelete(detail.skill, i.key) }, t('deleteOne')) : null,
                  ),
                  h('div', { className: 'path' }, i.path),
                )),
              ),
              h('div', { className: 'sec' },
                h('button', { className: 'smx-btn danger', disabled: detail.skill.readOnly, onClick: () => doDelete(detail.skill, undefined), title: detail.skill.readOnly ? t('noDelete') : '' }, t('deleteAll')),
              ),
              detail.frontmatter ? h('div', { className: 'sec' }, h('h5', null, t('frontmatter')), h('pre', null, detail.frontmatter)) : null,
              detail.body ? h('div', { className: 'sec' }, h('h5', null, t('body')), h('pre', null, detail.body)) : null,
            ) : null,
          ),
        ),

        // status bar
        h('div', { className: 'smx-status' },
          h('span', null, status),
          notice ? h('span', { className: 'smx-error' }, notice) : null,
        ),

        // dialogs
        dialog === 'install' ? h(InstallDialog, { api, roots: data?.roots ?? [], t, onClose: () => setDialog(null), onDone: (v) => { if (v?.catalog) setData(v.catalog); else load() } }) : null,
        dialog === 'cat' ? h(CategoryDialog, { api, categories, t, onClose: () => setDialog(null), onDone: () => load() }) : null,
        dialog === 'trash' ? h(TrashDialog, { api, t, onClose: () => setDialog(null), onDone: (cat) => { if (cat) setData(cat) } }) : null,
        dialog === 'export' ? h(ExportDialog, { api, t, onClose: () => setDialog(null) }) : null,
      )
    }
    //#endregion

    function SidebarIcon({ size }) {
      return h('svg', { viewBox: '0 0 24 24', width: size ?? 18, height: size ?? 18, 'aria-hidden': 'true', style: { display: 'block', pointerEvents: 'none' } },
        h('rect', { x: 3, y: 3, width: 8, height: 8, rx: 2, fill: 'currentColor' }),
        h('rect', { x: 13, y: 3, width: 8, height: 8, rx: 2, fill: 'currentColor', opacity: 0.6 }),
        h('rect', { x: 3, y: 13, width: 8, height: 8, rx: 2, fill: 'currentColor', opacity: 0.6 }),
        h('rect', { x: 13, y: 13, width: 8, height: 8, rx: 2, fill: 'currentColor', opacity: 0.35 }),
      )
    }

    //#region plugin entry
    const inject = ['slots', 'locale', 'layout', 'remote']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-manager: dictionaries')
      const t = ctx.locale.bind(NS)

      // Mount the Host Remote namespace for this plugin. The namespace service is
      // created by the gateway, so we resolve it lazily on each call: the facade
      // object identity is stable from the first render, and every method simply
      // awaits the namespace becoming available.
      let unmount = null
      const mountPromise = ctx.remote.$mount(TYPERT_REMOTE).then((dispose) => { unmount = dispose })
      async function ns() {
        await mountPromise
        return ctx.get('remote.skillManager')
      }
      const call = (method) => async (...args) => unwrap(await (await ns())[method](...args))
      const api = {
        refresh: call('refresh'),
        scan: call('scan'),
        roots: call('roots'),
        updateCategory: call('updateCategory'),
        createCategory: call('createCategory'),
        renameCategory: call('renameCategory'),
        deleteCategory: call('deleteCategory'),
        setAlias: call('setAlias'),
        setFavorite: call('setFavorite'),
        configure: call('configure'),
        deleteSkill: call('deleteSkill'),
        trashList: call('trashList'),
        restore: call('restore'),
        purge: call('purge'),
        validateSource: call('validateSource'),
        installLocal: call('installLocal'),
        installGit: call('installGit'),
        revealPath: call('revealPath'),
        exportCatalog: call('exportCatalog'),
        skillDetail: call('skillDetail'),
      }
      ctx.effect(() => async () => { await mountPromise; if (unmount) await unmount() }, 'ui-skill-manager: remote mount')

      // Sidebar entry (icon) — clicking selects the keyed main panel.
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => t('panel'),
        locale: NS,
      }, SidebarIcon))

      // Main panel, keyed by the same id the layout dispatches for the active panel.
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ api, t }),
      }, SkillManagerPanel))
    }
    //#endregion

    return { inject, apply }
  },
})
