// dsh-wrongbook browser half: the settings section.
//
// 跟 dsh-card-updater 同一套挂载方式：只注册一个 settings.section 座位，
// 不碰左下角侧栏，所以界面上唯一的入口是「设置 → 错题库」。
window.__ModuleLoader__.load({
  id: 'dsh-wrongbook',
  factory: (require) => {
    const react = require('react')
    const h = react.createElement
    const { useState, useEffect, useCallback, useMemo, Fragment } = react

    const NS = 'settings.dsh-wrongbook'
    const BASE = '/dsh-wrongbook'

    let translate = (key) => key
    const t = (key) => {
      try {
        return translate(key)
      } catch {
        return key
      }
    }

    const zh = {
      nav: '错题库',
      'panel.title': '错题库',
      'panel.desc': '按卡片分类记下调试中踩过的坑；卡出问题时先查它自己的错题库，再跨卡查询。',
      'tab.entries': '人物卡错题',
      'tab.other': '其它错题',
      'tab.scripts': '卡脚本',
      'tab.backup': '备份与还原',
      'search.ph': '跨卡查询：症状、标签、报错原文…',
      'filter.status': '全部状态',
      'filter.scope': '全部范围',
      'btn.checkSelf': '检测更新',
      'btn.save': '保存',
      'btn.reload': '重新载入',
      'btn.rescan': '重新扫描卡片目录',
      'btn.add': '新增条目',
      'btn.backup': '手动备份',
      'btn.openData': '打开数据目录',
      'btn.openBackup': '打开备份目录',
      'btn.import': '导入 JSON',
      'btn.export': '导出 JSON',
      'btn.close': '关闭',
      'btn.cancel': '取消',
      'btn.confirm': '确认',
      'btn.edit': '编辑',
      'btn.remove': '删除',
      'btn.restore': '还原',
      'btn.prune': '清理旧备份',
      'btn.copyTo': '复制到配对卡',
      'btn.rename': '改分类名',
      'btn.markFixed': '标记已修复',
      'order.hint': '调试检索顺序：① 本卡错题库 → ② 其它错题 → ③ 跨卡查询',
      'own.title': '① 本卡错题库',
      'own.title.other': '① 本分类错题库',
      'other.title': '② 其它错题',
      'cross.title': '③ 跨卡查询',
      'other.empty': '其它错题那一组里没有相似记录。',
      'own.empty': '这张卡还没有记录。第一次踩坑之后，把它记下来。',
      'cross.empty': '其余卡片里没有相似记录。',
      'cards.title': '卡片分类',
      'cards.title.other': '其它分类',
      'cards.empty': '卡片目录里还没有 JSON 卡片。',
      'cards.missing': '文件已不在卡片目录',
      'count.open': '未解决',
      'count.watch': '观察中',
      'count.fixed': '已修复',
      'status.open': '未解决',
      'status.watch': '观察中',
      'status.fixed': '已修复',
      'field.title': '症状',
      'field.title.ph': '一句话说清看到什么',
      'field.symptom': '现象',
      'field.symptom.ph': '什么条件下出现、具体表现',
      'field.cause': '根因',
      'field.cause.ph': '查到的真正原因',
      'field.fix': '修法',
      'field.fix.ph': '已验证的改法；没解决就留空',
      'field.scope': '范围',
      'field.status': '状态',
      'field.tags': '标签',
      'field.tags.ph': '逗号或空格分隔',
      'field.refs': '涉及',
      'field.refs.ph': '文件路径或字段，如 /data/extensions/regex_scripts/0',
      'field.evidence': '证据',
      'field.evidence.ph': '日志、报错原文、游玩记录引用',
      'editor.add': '新增条目',
      'editor.edit': '编辑条目',
      'sec.own': '本卡记录',
      'sec.detail': '详情',
      'backup.current': '当前数据',
      'backup.list': '备份',
      'backup.empty': '还没有备份。写盘前会自动生成一份，也可以现在手动备份。',
      'backup.entries': '{n} 条',
      'backup.entriesUnknown': '—',
      'backup.keepHint': '超出这个数量的旧备份会被删掉；自动清理的上限是 60 份。',
      'scripts.hint':
        '卡内自带的自定义脚本与机制条目。DSH 没有全局脚本槽：脚本随卡加载，换一张卡就换一套，所以排查任何一张卡之前先看清它带了什么。',
      'scripts.loading': '正在盘点…（要读几张十几 MB 的卡，第一次会慢一点）',
      'scripts.summary': '共 {n} 张卡，其中 {flagged} 张带特化内容',
      'scripts.count': '{n} 个脚本',
      'scripts.specialCount': '特化 {n}',
      'scripts.controllerCount': '控制器 {n}',
      'scripts.none': '这张卡没有自带脚本。',
      'scripts.disabled': '停用',
      'scripts.controllers': '控制器条目',
      'scripts.patchEntries': '含 update / json_patch 的条目',
      'scripts.tools': '工具目录里的脚本',
      'scripts.toolsHint': 'data/tools 下不属于任何一张卡的脚本：从卡里导出来的，或为卡自制待命的那批。',
      'scripts.empty': '没有扫到脚本。',
      'scripts.otherCard': '其它张卡',
      'install.ok': '插件安装正常：profile 清单里有它，node_modules 的链接也通。Tavern 更新只重写自己托管的那几项，碰不到这里。',
      'install.bad': '插件在 profile 清单里不见了 —— 可能更新时被抹掉，也可能被手动移除过。补回：',
      'backup.dir.title': '备份目录',      'backup.dir.custom': '自定义',
      'backup.dir.pick': '选择文件夹',
      'backup.dir.reset': '恢复默认',
      'backup.dir.hint': '只影响之后写入的备份：旧目录里已有的备份不会搬动，也不会被删掉。请填绝对路径。',
      'reflux.open': '回流到 Skill',
      'reflux.title': '回流到 Skill',
      'reflux.hint':
        '把错题库里的条目写进某个 skill 的参考资料，以后做同类事情时 Agent 能读到。只增不改：同名的不会重复写，你手工改过的内容也不会被覆盖。',
      'reflux.skill': '目标 skill',
      'reflux.file': '目标文件（相对 skill 目录）',
      'reflux.scope': '范围',
      'reflux.scopeAll': '全部',
      'reflux.scopeCard': '当前分类',
      'reflux.scopeActive': '未解决的',
      'reflux.plan': '将写入 {n} 条',
      'reflux.builtinWarn': '内置 skill 在程序目录里，Tavern 更新会整份覆盖它，所以这里只写你自己的。',
      'reflux.noSkill': '还没有自己的 skill —— 先建一个，回流才有落脚处。',
      'reflux.create': '新建 skill',
      'reflux.createHint': '小写字母、数字、连字符，例如 mvu-migration-notes',
      'reflux.skillDescHint': '简介 —— 写清什么时候该读它，Agent 靠这句决定要不要自动加载',
      'reflux.createNeedsName': '名字必填（小写字母、数字、连字符）；简介可以不填，但不填就很难被自动想起。',
      'reflux.write': '写入',
      'reflux.done': '已写入 {n} 条到 {file}（跳过 {m} 条，文件里已有同名）',
      'reflux.doneAllSkip': '这 {n} 条都已经在 {file} 里了，没有需要写的。',
      'reflux.created': '已建好 skill「{name}」',
      'reflux.sample': '示例',
      'reflux.sampleTitle': '不知道怎么写？点一下，按当前范围和错题库里的实际条目算一句出来，可以直接用或改。',
      'reflux.skillEntries': '{n} 条',
      'reflux.deleteSkill': '删除这个 skill',
      'reflux.deleted': '已删掉「{name}」，删前整份备份在 {backup}',
      'reflux.refs': '参考资料',
      'reflux.noRefs': '（还没回流过东西）',
      'reflux.noDesc': '（这个 skill 没写简介 —— 没有简介它就很难被自动想起来）',
      'reflux.cancelCreate': '收起',
      'reflux.newSkill': '新建一个',
      'reflux.panelHint': '回流只写你自己的 skill：内置的在程序目录里，Tavern 更新会整份覆盖。',
      'browse.title': '选择文件夹',
      'browse.go': '转到',
      'browse.drives': '驱动器',
      'browse.up': '上一级',
      'browse.pick': '用这个文件夹',
      'browse.pickHint': '点进一个文件夹，或粘贴路径后按「转到」',
      'browse.empty': '这一层没有子文件夹',
      'browse.hint': '点文件夹进去，也可以直接粘贴路径。空路径列出所有驱动器。',
      'ok.backupDir': '备份目录已改为 {dir}',
      'ok.backupDirReset': '备份目录已恢复默认',
      'import.hint': '粘贴错题库 JSON：整份导出文件（含 entries）或直接一个条目数组。同卡同标题的条目会跳过。',
      'import.submit': '开始导入',
      'rename.hint': '只改显示名，不动卡片文件；留空则回到卡片文件名。',
      'misc.updated': '更新于',
      'misc.created': '创建于',
      'misc.dataRoot': '数据目录',
      'misc.backups': '{n} 份备份',
      'misc.log': '运行日志',
      'misc.count': '共 {n} 条',
      'misc.entriesCount': '{n} 条记录',
      'misc.cardsCount': '{n} 个分类',
      'ver.upToDate': '已是最新版',
      'ver.changed': '本地有改动',
      'ver.available': '有新版本 {v}',
      'ver.unknown': '未检测',
      'ver.remote': '远端 {v}',
      'ver.lastAt': '上次检测 {at}',
      'ver.hint.changed': '自上次检测后这些文件变过：{files}',
      'ver.hint.remote': '远端清单：{url}',
      'ver.hint.noRemote': '未配置远端清单，检测比对的是插件自身文件指纹与版本号。',
      'ok.added': '已记入 {name}',
      'ok.updated': '条目已更新',
      'ok.removed': '条目已删除',
      'ok.moved': '已复制到 {name}',
      'ok.saved': '已保存',
      'ok.backup': '已手动备份，现在共 {n} 份',
      'ok.rescan': '已重新扫描，{n} 张卡',
      'ok.renamed': '分类名已更新',
      'ok.restored': '已从备份恢复，{n} 条记录',
      'ok.restoredHint': '恢复后的内容立刻成为当前数据；恢复前的那一份也已经自动备份过。',
      'ok.deletedBackup': '已删除备份 {file}',
      'ok.pruned': '已清理 {n} 份，保留最近 {keep} 份',
      'ok.opened': '已交给资源管理器打开：{path}',
      'ok.imported': '导入 {added} 条，跳过 {skipped} 条',
      'ok.exported': '已导出 JSON 文件',
      'err.bridge': '连不上后台',
      'err.emptyImport': '先粘贴要导入的 JSON',
      'err.bucketName': '先写一个分类名',
      'bucket.add': '新增分类',
      'bucket.name.ph': '分类名，比如 卡片更新器',
      'bucket.new': '新分类',
      'bucket.empty': '这一组还没有分类。',
      'bucket.deleteHint': '删掉分类时，它下面的记录会移到「通用 / 未归类」，不会跟着一起消失。',
      'bucket.otherHint': '不挂在人物卡上的问题放这里：插件自身的更新链、合并策略、工具链、界面。',
      'chip.other': '其它',
      'chip.plain': '原版',
      'btn.deleteBucket': '删除分类',
      'ok.bucketAdded': '已新增分类「{name}」',
      'ok.bucketRemoved': '已删除分类，{n} 条记录移到「通用 / 未归类」',
      'field.card': '所属分类',
      'label.card': '卡片',
      'label.avatar': '头像',
    }

    const en = {
      nav: 'Wrongbook',
      'panel.title': 'Wrongbook',
      'panel.desc': 'Per-card defect ledger. When a card breaks, check its own entries first, then search the rest.',
      'search.ph': 'Cross-card search: symptom, tag, error text…',
      'tab.entries': 'Card issues',
      'tab.other': 'Other issues',
      'tab.scripts': 'Card scripts',
      'tab.backup': 'Backups',
      'search.ph': 'Cross-card search: symptom, tag, error text…',
      'filter.status': 'All statuses',
      'filter.scope': 'All scopes',
      'btn.checkSelf': 'Check update',
      'btn.save': 'Save',
      'btn.reload': 'Reload',
      'btn.rescan': 'Rescan card directory',
      'btn.add': 'New entry',
      'btn.backup': 'Backup now',
      'btn.openData': 'Open data directory',
      'btn.openBackup': 'Open backup directory',
      'btn.import': 'Import JSON',
      'btn.export': 'Export JSON',
      'btn.close': 'Close',
      'btn.cancel': 'Cancel',
      'btn.confirm': 'Confirm',
      'btn.edit': 'Edit',
      'btn.remove': 'Delete',
      'btn.restore': 'Restore',
      'btn.prune': 'Prune old backups',
      'btn.copyTo': 'Copy to paired card',
      'btn.rename': 'Rename bucket',
      'btn.markFixed': 'Mark fixed',
      'order.hint': 'Debug lookup order: (1) this card \u2192 (2) other issues \u2192 (3) the rest of the cards',
      'own.title': '1) This card',
      'own.title.other': '1) This bucket',
      'other.title': '2) Other issues',
      'cross.title': '3) Cross-card',
      'other.empty': 'Nothing similar in the other-issues group.',
      'own.empty': 'Nothing recorded for this card yet.',
      'cross.empty': 'No similar records on other cards.',
      'cards.title': 'Card buckets',
      'cards.title.other': 'Other buckets',
      'cards.empty': 'No card JSON found in the card directory.',
      'cards.missing': 'File no longer in the card directory',
      'count.open': 'open',
      'count.watch': 'watch',
      'count.fixed': 'fixed',
      'status.open': 'Open',
      'status.watch': 'Watching',
      'status.fixed': 'Fixed',
      'field.title': 'Symptom',
      'field.title.ph': 'One line: what you saw',
      'field.symptom': 'Details',
      'field.symptom.ph': 'When it happens, what exactly it looks like',
      'field.cause': 'Cause',
      'field.cause.ph': 'The actual root cause',
      'field.fix': 'Fix',
      'field.fix.ph': 'Verified fix; leave empty while unresolved',
      'field.scope': 'Scope',
      'field.status': 'Status',
      'field.tags': 'Tags',
      'field.tags.ph': 'comma or space separated',
      'field.refs': 'References',
      'field.refs.ph': 'file path or field, e.g. /data/extensions/regex_scripts/0',
      'field.evidence': 'Evidence',
      'field.evidence.ph': 'log, raw error, play-record reference',
      'editor.add': 'New entry',
      'editor.edit': 'Edit entry',
      'sec.own': 'Entries',
      'sec.detail': 'Details',
      'backup.current': 'Current data',
      'backup.list': 'Backups',
      'backup.empty': 'No backups yet. One is written before every save; you can also take one now.',
      'backup.entries': '{n} entries',
      'backup.entriesUnknown': '—',
      'backup.keepHint': 'Older backups beyond this count are deleted; automatic pruning caps at 60.',
      'scripts.hint':
        'Scripts a card ships with, plus the mechanism entries that steer it. DSH has no global script slot: scripts load with the card, so read what a card carries before debugging it.',
      'scripts.loading': 'Taking inventory… (this reads a few multi-megabyte cards on the first pass)',
      'scripts.summary': '{n} cards, {flagged} carrying something special',
      'scripts.count': '{n} scripts',
      'scripts.specialCount': '{n} special',
      'scripts.controllerCount': '{n} controllers',
      'scripts.none': 'This card ships no scripts.',
      'scripts.disabled': 'off',
      'scripts.controllers': 'Controller entries',
      'scripts.patchEntries': 'Entries carrying update / json_patch',
      'scripts.tools': 'Scripts under the tools folder',
      'scripts.toolsHint': 'Under data/tools, belonging to no card: exported from one, or waiting to be adapted.',
      'scripts.empty': 'Nothing scanned.',
      'scripts.otherCard': 'Other cards',
      'install.ok': 'Installed properly: it is in the profile manifest and the node_modules link resolves. Tavern updates only rewrite what they manage.',
      'install.bad': 'The plugin is missing from the profile manifest — an update may have dropped it, or it was removed by hand. To put it back:',
      'backup.dir.title': 'Backup folder',
      'backup.dir.custom': 'custom',
      'backup.dir.pick': 'Choose folder',
      'backup.dir.reset': 'Use default',
      'backup.dir.hint': 'Affects only backups written from now on: existing files in the old folder are neither moved nor deleted. Use an absolute path.',
      'browse.title': 'Choose folder',
      'reflux.open': 'Reflux to skill',
      'reflux.title': 'Reflux to skill',
      'reflux.hint':
        'Write ledger entries into a skill reference so agents read them before doing the same work again. Append-only: same-title entries are not repeated, and your own edits stay.',
      'reflux.skill': 'Target skill',
      'reflux.file': 'Target file (relative to the skill)',
      'reflux.scope': 'Scope',
      'reflux.scopeAll': 'Everything',
      'reflux.scopeCard': 'This bucket',
      'reflux.scopeActive': 'Unresolved',
      'reflux.plan': '{n} entries to write',
      'reflux.builtinWarn': 'Built-in skills live in the program directory and are replaced wholesale on update, so only your own are writable here.',
      'reflux.noSkill': 'No skill of your own yet — create one first, so the entries have somewhere to land.',
      'reflux.create': 'New skill',
      'reflux.createHint': 'lowercase letters, digits, hyphens, e.g. mvu-migration-notes',
      'reflux.skillDescHint': 'Description — say when to read it; agents decide whether to load this skill from that line',
      'reflux.createNeedsName': 'The name is required (lowercase letters, digits, hyphens); the description is optional, but without it the skill is rarely recalled.',
      'reflux.write': 'Write',
      'reflux.done': 'Wrote {n} entries into {file} ({m} skipped, already present)',
      'reflux.doneAllSkip': 'All {n} entries are already in {file}; nothing to write.',
      'reflux.created': 'Created skill "{name}"',
      'reflux.sample': 'Example',
      'reflux.sampleTitle': 'Not sure what to write? Click to have one computed from the current scope and the actual ledger entries — use it as is or edit it.',
      'reflux.skillEntries': '{n} entries',
      'reflux.deleteSkill': 'Delete this skill',
      'reflux.deleted': 'Deleted "{name}"; a full copy was kept at {backup}',
      'reflux.refs': 'References',
      'reflux.noRefs': '(nothing refluxed yet)',
      'reflux.noDesc': '(no description — without one it is rarely recalled)',
      'reflux.cancelCreate': 'Collapse',
      'reflux.newSkill': 'New one',
      'reflux.panelHint': 'Reflux only writes your own skills: built-ins live in the program directory and an update replaces them whole.',
      'browse.go': 'Go',
      'browse.drives': 'Drives',
      'browse.up': 'Up one level',
      'browse.pick': 'Use this folder',
      'browse.pickHint': 'Open a folder, or paste a path and press Go',
      'browse.empty': 'No subfolders here',
      'browse.hint': 'Open a folder, or paste a path directly. An empty path lists every drive.',
      'ok.backupDir': 'Backup folder changed to {dir}',
      'ok.backupDirReset': 'Backup folder reset to default',
      'import.hint': 'Paste wrongbook JSON: a full export (with entries) or a bare array. Entries with the same card and title are skipped.',
      'import.submit': 'Import',
      'rename.hint': 'Display name only; the card file is untouched. Empty falls back to the file name.',
      'misc.updated': 'updated',
      'misc.created': 'created',
      'misc.dataRoot': 'Data directory',
      'misc.backups': '{n} backups',
      'misc.log': 'Log',
      'misc.count': '{n} entries',
      'misc.entriesCount': '{n} records',
      'misc.cardsCount': '{n} buckets',
      'ver.upToDate': 'Up to date',
      'ver.changed': 'Changed locally',
      'ver.available': 'New version {v}',
      'ver.unknown': 'Not checked',
      'ver.remote': 'remote {v}',
      'ver.lastAt': 'checked {at}',
      'ver.hint.changed': 'These files changed since the last check: {files}',
      'ver.hint.remote': 'Remote manifest: {url}',
      'ver.hint.noRemote': 'No remote manifest configured; the check compares this plugin\u2019s own file fingerprint and version.',
      'ok.added': 'Added to {name}',
      'ok.updated': 'Entry updated',
      'ok.removed': 'Entry deleted',
      'ok.moved': 'Copied to {name}',
      'ok.saved': 'Saved',
      'ok.backup': 'Backup written, {n} total',
      'ok.rescan': 'Rescanned, {n} cards',
      'ok.renamed': 'Bucket renamed',
      'ok.restored': 'Restored from backup, {n} records',
      'ok.restoredHint': 'The restored content is live now; the previous state was backed up first.',
      'ok.deletedBackup': 'Deleted backup {file}',
      'ok.pruned': 'Pruned {n}, kept the latest {keep}',
      'ok.opened': 'Handed to the file manager: {path}',
      'ok.imported': 'Imported {added}, skipped {skipped}',
      'ok.exported': 'JSON exported',
      'err.bridge': 'Cannot reach the host half',
      'err.emptyImport': 'Paste the JSON to import first',
      'err.bucketName': 'Give the bucket a name first',
      'bucket.add': 'New bucket',
      'bucket.name.ph': 'Bucket name, e.g. Card updater',
      'bucket.new': 'New bucket',
      'bucket.empty': 'This group has no buckets yet.',
      'bucket.deleteHint': 'Deleting a bucket moves its records to "General / Unsorted" instead of removing them.',
      'bucket.otherHint': 'Issues that do not belong to a character card: plugin update chains, merge policy, tooling, UI.',
      'chip.other': 'other',
      'chip.plain': 'plain',
      'btn.deleteBucket': 'Delete bucket',
      'ok.bucketAdded': 'Bucket "{name}" added',
      'ok.bucketRemoved': 'Bucket deleted, {n} records moved to "General / Unsorted"',
      'field.card': 'Bucket',
      'label.card': 'Card',
      'label.avatar': 'Avatar',
    }

    const CSS = [
      '.dwb-root{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}',
      '.dwb-wrap{display:flex;flex-direction:column;gap:12px;padding:8px 2px 28px}',
      '.dwb-header{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}',
      '.dwb-header-actions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto;flex-wrap:wrap}',
      '.dwb-path{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));word-break:break-all;margin-top:2px}',
      '.dwb-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-tabs{display:flex;gap:3px;flex:none;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dwb-tab{height:26px;padding:0 12px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;transition:background .15s ease,color .15s ease}',
      '.dwb-tab:hover{color:var(--dsw-alias-label-primary)}',
      '.dwb-tab.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      '.dwb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dwb-col{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dwb-grow{flex:1 1 auto;min-width:0}',
      '.dwb-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;transition:border-color .15s ease}',
      '.dwb-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.dwb-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.dwb-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}',
      '.dwb-btn.ghost{background:transparent}',
      '.dwb-btn.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dwb-btn.warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.dwb-btn.bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dwb-btn.tiny{height:24px;padding:0 9px;font-size:11px;border-radius:6px}',
      '.dwb-input,.dwb-select,.dwb-area{width:100%;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;padding:5px 8px;font-family:inherit}',
      '.dwb-input,.dwb-select{height:28px;padding:0 8px}',
      '.dwb-area{min-height:56px;resize:vertical;line-height:1.5}',
      '.dwb-select{width:auto;min-width:96px}',
      '.dwb-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px;display:flex;flex-direction:column;gap:10px}',
      '.dwb-card.flat{background:var(--dsw-alias-bg-layer-2);gap:8px}',
      '.dwb-title{font-size:14px;font-weight:700}',
      '.dwb-sub{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.dwb-chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dwb-chip.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.dwb-chip.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.dwb-chip.bad{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.dwb-chip.tag{border-style:dashed}',
      '.dwb-ver{font-family:ui-monospace,Consolas,monospace;letter-spacing:.02em;color:var(--dsw-alias-label-primary)}',
      '.dwb-hint{font-size:11px;color:var(--dsw-alias-label-secondary);padding:6px 9px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px dashed var(--dsw-alias-border-l2)}',
      '.dwb-cols{display:grid;grid-template-columns:minmax(184px,236px) minmax(0,1fr);gap:12px;align-items:start}',
      '.dwb-list{display:flex;flex-direction:column;gap:3px;max-height:560px;overflow:auto;padding-right:2px;scrollbar-gutter:stable}',
      // 条目区自己滚：一栏十几条时，让它撑高整个设置页比让它内部滚动难用得多。
      // 标题留在容器外，滚动时还看得见自己在看哪一段。
      '.dwb-entries{display:flex;flex-direction:column;gap:8px;max-height:min(560px,52vh);overflow:auto;padding-right:2px;scrollbar-gutter:stable}',
      // 卡脚本：一张卡一个折叠块。details 不接受控的 open —— 接了之后 React 会在
      // 每次重渲染时把展开状态按回去，用户就收不起来了。
      '.dwb-script{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-script+.dwb-script{margin-top:6px}',
      '.dwb-script>summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;outline:none}',
      '.dwb-script>summary::-webkit-details-marker{display:none}',
      '.dwb-script>summary::before{content:"▸";color:var(--dsw-alias-label-secondary);font-size:10px;flex:none}',
      '.dwb-script[open]>summary::before{content:"▾"}',
      '.dwb-script-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-all}',
      '.dwb-scripts{display:flex;flex-direction:column;gap:3px;margin-top:8px}',
      '.dwb-script-row{display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 4px;border-radius:6px;flex-wrap:wrap}',
      '.dwb-script-row.common{opacity:.55}',
      '.dwb-dot{flex:none;font-size:9px;color:var(--dsw-alias-state-success-primary)}',
      '.dwb-dot.off{color:var(--dsw-alias-label-secondary)}',
      '.dwb-mono{font-family:ui-monospace,Consolas,monospace}',
      '.dwb-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;width:100%;color:inherit;font:inherit}',
      '.dwb-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-item.on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-ava{width:30px;height:30px;border-radius:8px;object-fit:cover;flex:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dwb-ava-fb{width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.dwb-item-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dwb-item-sub{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-entry{border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);padding:10px 11px;display:flex;flex-direction:column;gap:7px}',
      '.dwb-entry.fixed{opacity:.78}',
      '.dwb-entry-head{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}',
      '.dwb-entry-title{font-size:13px;font-weight:600;flex:1 1 180px;min-width:0;word-break:break-word}',
      '.dwb-details{border-top:1px dashed var(--dsw-alias-border-l1);padding-top:6px}',
      '.dwb-details summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary);outline:none}',
      '.dwb-kv{display:grid;grid-template-columns:56px minmax(0,1fr);gap:4px 8px;margin-top:6px;font-size:12px}',
      '.dwb-kv dt{color:var(--dsw-alias-label-secondary);font-size:11px;padding-top:1px}',
      '.dwb-kv dd{margin:0;word-break:break-word;white-space:pre-wrap}',
      '.dwb-msg{padding:8px 10px;border-radius:9px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:3px}',
      '.dwb-msg.ok{border-color:var(--dsw-alias-state-success-primary)}',
      '.dwb-msg.bad{border-color:var(--dsw-alias-state-error-primary)}',
      '.dwb-pre{margin:6px 0 0;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}',
      '.dwb-note{display:flex;flex-direction:column;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-log{font-family:ui-monospace,Consolas,monospace;font-size:11px;max-height:132px;overflow:auto;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.dwb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.dwb-field{display:flex;flex-direction:column;gap:3px}',
      '.dwb-field>span{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-empty{padding:18px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-backups{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto}',
      '.dwb-backup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-backup-time{font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      '.dwb-stat{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}',
      '.dwb-stat-cell{padding:7px 9px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.dwb-stat-k{font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dwb-stat-v{font-size:12px;font-weight:600;word-break:break-all}',
      '.dwb-area.tall{min-height:110px;font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      '.dwb-input.narrow{width:64px;min-width:64px}',
      // 目录浏览弹窗：参照卡片更新器的做法，自己列目录、自己选，不赌宿主的选择器。
      '.dwb-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);padding:24px}',
      '.dwb-sheet{width:min(560px,100%);max-height:min(620px,88vh);overflow:auto;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.28)}',
      '.dwb-browse{display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:4px;background:var(--dsw-alias-bg-layer-2)}',
      '.dwb-up{font-family:ui-monospace,Consolas,monospace}',
      '@media (max-width:640px){.dwb-cols{grid-template-columns:1fr}.dwb-grid2{grid-template-columns:1fr}}',
    ].join('\n')

    /** 样式表按 id 挂一次即可；重复挂会把同一份规则叠很多遍。 */
    function installStyles() {
      try {
        for (const old of Array.from(document.querySelectorAll('style[data-dsh-wrongbook]'))) old.remove()
        const tag = document.createElement('style')
        tag.setAttribute('data-dsh-wrongbook', '1')
        tag.textContent = CSS
        document.head.appendChild(tag)
      } catch {
        /* 没有 head 的文档不该让面板渲染不出来 */
      }
    }

    function useStyles() {
      useEffect(() => {
        installStyles()
      }, [])
    }

    async function apiGet() {
      const res = await fetch(`${BASE}/state`, { headers: { accept: 'application/json' } })
      const body = await res.json()
      if (!body || body.ok === false) throw new Error((body && body.error) || `HTTP ${res.status}`)
      return body
    }

    async function apiPost(payload) {
      const res = await fetch(`${BASE}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!body) throw new Error(`HTTP ${res.status}`)
      return body
    }

    const avatarUrl = (key) => `${BASE}/avatar?card=${encodeURIComponent(key)}`

    const statusClass = (status) => (status === 'fixed' ? 'ok' : status === 'watch' ? 'warn' : 'bad')
    const statusLabel = (status) => t(`status.${status}`)

    function fmtTime(value) {
      if (!value) return ''
      const ms = typeof value === 'number' ? value : Date.parse(value)
      if (!ms) return ''
      try {
        return new Date(ms).toLocaleString()
      } catch {
        return ''
      }
    }

    function fmtBytes(n) {
      const size = Number(n) || 0
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
      return `${(size / 1024 / 1024).toFixed(1)} MB`
    }

    /* ------------------------------------------------------------ pieces */

    /** 头像取不到就退回首字方块，卡片目录里没配图是常态。 */
    function Avatar({ card }) {
      const [broken, setBroken] = useState(false)
      const has = card && card.avatar
      useEffect(() => {
        setBroken(false)
      }, [card && card.key, has])
      if (!has || broken) {
        const ch = String((card && (card.name || card.base)) || '?').trim().slice(0, 1)
        return h('div', { className: 'dwb-ava-fb', 'aria-hidden': 'true' }, ch || '?')
      }
      return h('img', {
        className: 'dwb-ava',
        src: avatarUrl(card.key),
        alt: '',
        loading: 'lazy',
        onError: () => setBroken(true),
      })
    }

    function CountChips({ count }) {
      if (!count) return null
      const out = []
      if (count.open) out.push(h('span', { key: 'o', className: 'dwb-chip bad' }, `${count.open} ${t('count.open')}`))
      if (count.watch) out.push(h('span', { key: 'w', className: 'dwb-chip warn' }, `${count.watch} ${t('count.watch')}`))
      if (count.fixed) out.push(h('span', { key: 'f', className: 'dwb-chip ok' }, `${count.fixed} ${t('count.fixed')}`))
      return out.length ? h(Fragment, null, out) : null
    }

    /**
     * 二次确认按钮。
     *
     * 不弹系统对话框：Electron 的渲染进程不支持 prompt（返回 null 且不报错），
     * confirm 的行为各版本也不一致 —— 点下去没反应是最难查的一类故障。
     * 这里让按钮自己变成确认态，删除和还原都必须再点一次。
     */
    function ConfirmButton({ label, armed, onArm, onCancel, onConfirm }) {
      if (armed) {
        return h(
          Fragment,
          null,
          h('button', { type: 'button', className: 'dwb-btn tiny bad', onClick: onConfirm }, t('btn.confirm')),
          h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onCancel }, t('btn.cancel')),
        )
      }
      return h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onArm }, label)
    }

    function CardRow({ card, active, onPick }) {
      return h(
        'button',
        {
          type: 'button',
          className: `dwb-item${active ? ' on' : ''}`,
          onClick: () => onPick(card.key),
          title: card.abs || card.name,
        },
        h(Avatar, { card }),
        h(
          'div',
          { className: 'dwb-grow dwb-col' },
          h('div', { className: 'dwb-item-name' }, card.name),
          h(
            'div',
            { className: 'dwb-row', style: { gap: 4 } },
            card.group === 'other'
              ? h('span', { className: 'dwb-chip' }, t('chip.other'))
              : h(
                  'span',
                  { className: `dwb-chip${card.kind === 'mvu' ? ' warn' : ''}` },
                  card.kind === 'mvu' ? 'MVU' : t('chip.plain'),
                ),
            card.missing ? h('span', { className: 'dwb-chip warn' }, '!') : null,
            h('span', { className: 'dwb-item-sub' }, `${(card.count && card.count.total) || 0}`),
          ),
        ),
        h(CountChips, { count: card.count }),
      )
    }

    function EntryView({ entry, cards, pending, setPending, onEdit, onDelete, onCopy, onStatus }) {
      const card = cards.find((c) => c.key === entry.cardKey)
      const pair = card && card.pairKey ? cards.find((c) => c.key === card.pairKey) : null
      const armKey = `entry:${entry.id}`
      return h(
        'div',
        { className: `dwb-entry${entry.status === 'fixed' ? ' fixed' : ''}` },
        h(
          'div',
          { className: 'dwb-entry-head' },
          h('span', { className: `dwb-chip ${statusClass(entry.status)}` }, statusLabel(entry.status)),
          h('span', { className: 'dwb-entry-title' }, entry.title || '(无标题)'),
          h('span', { className: 'dwb-chip' }, entry.scope),
          entry.tags && entry.tags.length
            ? h(
                Fragment,
                null,
                entry.tags.slice(0, 4).map((tag) => h('span', { key: tag, className: 'dwb-chip tag' }, tag)),
              )
            : null,
        ),
        h(
          'div',
          { className: 'dwb-row' },
          h('span', { className: 'dwb-sub' }, `${entry.id} · ${t('misc.updated')} ${fmtTime(entry.updatedAt)}`),
          h('span', { className: 'dwb-grow' }),
          entry.status !== 'fixed'
            ? h(
                'button',
                { type: 'button', className: 'dwb-btn tiny', onClick: () => onStatus(entry, 'fixed') },
                t('btn.markFixed'),
              )
            : null,
          pair
            ? h(
                'button',
                { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => onCopy(entry, pair.key) },
                t('btn.copyTo'),
              )
            : null,
          h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => onEdit(entry) }, t('btn.edit')),
          h(ConfirmButton, {
            label: t('btn.remove'),
            armed: pending === armKey,
            onArm: () => setPending(armKey),
            onCancel: () => setPending(null),
            onConfirm: () => onDelete(entry),
          }),
        ),
        h(
          'details',
          { className: 'dwb-details' },
          h('summary', null, t('sec.detail')),
          h(
            'dl',
            { className: 'dwb-kv' },
            entry.symptom ? h(Fragment, null, h('dt', null, t('field.symptom')), h('dd', null, entry.symptom)) : null,
            entry.cause ? h(Fragment, null, h('dt', null, t('field.cause')), h('dd', null, entry.cause)) : null,
            entry.fix ? h(Fragment, null, h('dt', null, t('field.fix')), h('dd', null, entry.fix)) : null,
            entry.refs ? h(Fragment, null, h('dt', null, t('field.refs')), h('dd', null, entry.refs)) : null,
            entry.evidence ? h(Fragment, null, h('dt', null, t('field.evidence')), h('dd', null, entry.evidence)) : null,
            h('dt', null, t('label.card')),
            h('dd', null, card ? card.name : entry.cardKey),
          ),
        ),
      )
    }

    /**
     * 目录浏览弹窗。
     *
     * 参照卡片更新器的做法：不调宿主的目录选择器 —— 那个能力在不在、能不能用
     * 都不一定 —— 改成让 host 列一层目录、这里渲染一层。空路径列出所有驱动器，
     * 所以换到别的盘也走得到。
     */
    /** 一行脚本：名字、字符数、外链、data 键、启停。 */
    function ScriptRow({ script }) {
      return h(
        'div',
        { className: `dwb-script-row${script.common ? ' common' : ''}` },
        h('span', { className: `dwb-dot${script.enabled ? '' : ' off'}` }, script.enabled ? '●' : '○'),
        h('span', { className: 'dwb-mono dwb-grow' }, script.name),
        h('span', { className: 'dwb-sub' }, `${script.chars} 字符`),
        script.link ? h('span', { className: 'dwb-chip' }, script.link) : null,
        script.dataKeys.length ? h('span', { className: 'dwb-chip tag' }, `data: ${script.dataKeys.join(', ')}`) : null,
        script.enabled ? null : h('span', { className: 'dwb-chip warn' }, t('scripts.disabled')),
      )
    }

    /**
     * 一张卡的脚本块。
     *
     * `details` 刻意不接受控的 `open`：接了之后每次重渲染都会把展开状态按回初始值，
     * 用户就再也收不起来（或展不开）。默认收起，summary 上写清带了多少特化内容。
     */
    function CardScriptBlock({ card }) {
      const bits = [t('scripts.count').replace('{n}', card.scripts.length)]
      if (card.special.length) bits.push(t('scripts.specialCount').replace('{n}', card.special.length))
      if (card.controllers.length) bits.push(t('scripts.controllerCount').replace('{n}', card.controllers.length))
      return h(
        'details',
        { className: 'dwb-script' },
        h(
          'summary',
          null,
          h('span', { className: 'dwb-script-name dwb-grow' }, card.name),
          bits.map((bit, i) => h('span', { key: i, className: `dwb-chip${i === 1 ? ' warn' : ''}` }, bit)),
        ),
        card.error ? h('div', { className: 'dwb-msg bad' }, card.error) : null,
        card.scripts.length
          ? h(
              'div',
              { className: 'dwb-scripts' },
              card.scripts.map((script, i) => h(ScriptRow, { key: i, script })),
            )
          : h('div', { className: 'dwb-sub' }, t('scripts.none')),
        card.controllers.length
          ? h('div', { className: 'dwb-sub' }, `${t('scripts.controllers')}：${card.controllers.join('、')}`)
          : null,
        card.patchEntries.length
          ? h('div', { className: 'dwb-sub' }, `${t('scripts.patchEntries')}：${card.patchEntries.join('、')}`)
          : null,
      )
    }

    /**
     * 回流弹窗：挑目标 skill、挑范围、看条数，然后写。
     *
     * 只列用户自己的 skill 能选；内置那些照实显示但写不了 —— 它们在程序目录里，
     * 下一次 Tavern 更新会整份覆盖，与其让人以为写成功了，不如当场说清。
     */
    function RefluxModal({ state, entries, selectedKey, onChange, onClose, onWrite, onCreate, onDelete, onSample }) {
      const skills = state.skills || []
      const mine = skills.filter((s) => !s.builtin)
      const current = mine.find((s) => s.name === state.skill) || null
      const count =
        state.scope === 'card'
          ? entries.filter((e) => e.cardKey === selectedKey).length
          : state.scope === 'active'
            ? entries.filter((e) => e.status !== 'fixed').length
            : entries.length
      const scopeLabel = { all: 'scopeAll', card: 'scopeCard', active: 'scopeActive' }

      return h(
        'div',
        {
          className: 'dwb-overlay',
          onClick: (ev) => {
            if (ev.target === ev.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'dwb-sheet' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('reflux.title')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onClose }, t('btn.close')),
          ),
          h('div', { className: 'dwb-sub' }, t('reflux.hint')),

          // 选目标和新建是两件不同的事，原来混在一起：那对输入框看着像是
          // "当前选中 skill 的简介"，切一下下拉它们还是空的，像坏了。
          // 现在新建归到开关后面，选中态只显示那个 skill 自己的信息。
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-sub dwb-grow' }, t('reflux.skill')),
            h(
              'button',
              {
                type: 'button',
                className: `dwb-btn tiny${state.creating ? ' primary' : ' ghost'}`,
                onClick: () => onChange({ creating: !state.creating, confirmDelete: '' }),
              },
              state.creating ? t('reflux.cancelCreate') : `＋ ${t('reflux.newSkill')}`,
            ),
          ),

          state.creating
            ? null
            : state.busy && !skills.length
              ? h('div', { className: 'dwb-sub' }, t('scripts.loading'))
              : mine.length
                ? h(
                    'select',
                    { className: 'dwb-select', value: state.skill, onChange: (ev) => onChange({ skill: ev.target.value }) },
                    mine.map((s) => h('option', { key: s.name, value: s.name }, s.name)),
                  )
                : h('div', { className: 'dwb-sub' }, t('reflux.noSkill')),

          !state.creating && current
            ? h(
                'div',
                { className: 'dwb-note' },
                h('div', { className: 'dwb-sub' }, current.description || t('reflux.noDesc')),
                h(
                  'div',
                  { className: 'dwb-sub' },
                  `${t('reflux.refs')}：${(current.references || []).join('、') || t('reflux.noRefs')} · ${t('reflux.skillEntries').replace('{n}', current.entries || 0)}`,
                ),
              )
            : null,

          !state.creating && current
            ? h(
                'div',
                { className: 'dwb-row' },
                h('span', { className: 'dwb-grow' }),
                h(ConfirmButton, {
                  label: t('reflux.deleteSkill'),
                  armed: state.confirmDelete === current.name,
                  onArm: () => onChange({ confirmDelete: current.name }),
                  onCancel: () => onChange({ confirmDelete: '' }),
                  onConfirm: onDelete,
                }),
              )
            : null,

          state.creating
            ? h(
                Fragment,
                null,
                h('input', {
                  className: 'dwb-input',
                  placeholder: t('reflux.createHint'),
                  value: state.newName,
                  onChange: (ev) => onChange({ newName: ev.target.value }),
                }),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('input', {
                    className: 'dwb-input dwb-grow',
                    placeholder: t('reflux.skillDescHint'),
                    value: state.newDesc || '',
                    onChange: (ev) => onChange({ newDesc: ev.target.value }),
                  }),
                  h('button', {
                    type: 'button',
                    className: 'dwb-btn ghost',
                    title: t('reflux.sampleTitle'),
                    onClick: onSample,
                  }, t('reflux.sample')),
                ),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('span', { className: 'dwb-sub dwb-grow' }, state.newName ? '' : t('reflux.createNeedsName')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn ghost',
                      disabled: state.busy || !state.newName,
                      onClick: onCreate,
                    },
                    t('reflux.create'),
                  ),
                ),
              )
            : null,

          h('div', { className: 'dwb-sub' }, t('reflux.file')),
          h('input', {
            className: 'dwb-input',
            value: state.file,
            onChange: (ev) => onChange({ file: ev.target.value }),
          }),

          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-sub' }, t('reflux.scope')),
            ...['all', 'card', 'active'].map((scope) =>
              h(
                'button',
                {
                  key: scope,
                  type: 'button',
                  className: `dwb-btn tiny${state.scope === scope ? ' primary' : ' ghost'}`,
                  onClick: () => onChange({ scope }),
                },
                t(`reflux.${scopeLabel[scope]}`),
              ),
            ),
            h('span', { className: 'dwb-grow' }),
            h('span', { className: 'dwb-sub' }, t('reflux.plan').replace('{n}', count)),
          ),

          state.message ? h('div', { className: 'dwb-msg' }, state.message) : null,

          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-grow' }),
            h('button', { type: 'button', className: 'dwb-btn ghost', onClick: onClose }, t('btn.close')),
            h(
              'button',
              {
                type: 'button',
                className: 'dwb-btn primary',
                disabled: state.busy || state.creating || !state.skill || !count,
                onClick: onWrite,
              },
              t('reflux.write'),
            ),
          ),
        ),
      )
    }

    function BrowseModal({ initialPath, onPick, onClose }) {
      const [view, setView] = useState(null)
      const [typed, setTyped] = useState(String(initialPath || ''))
      const [busy, setBusy] = useState(false)
      const [failed, setFailed] = useState('')

      const load = useCallback(async (target) => {
        setBusy(true)
        setFailed('')
        try {
          const res = await fetch(`${BASE}/list?path=${encodeURIComponent(target == null ? '' : target)}`)
          const body = await res.json()
          setView(body)
          if (body && body.dir && !body.drives) setTyped(body.dir)
        } catch (e) {
          setFailed(String(e && e.message ? e.message : e))
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        void load(initialPath)
      }, [load, initialPath])

      useEffect(() => {
        const onKey = (ev) => {
          if (ev.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const entries = (view && view.entries) || []
      const pickable = !!(view && view.dir && !view.drives && !view.error)

      return h(
        'div',
        {
          className: 'dwb-overlay',
          onClick: (ev) => {
            if (ev.target === ev.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'dwb-sheet' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('browse.title')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: onClose }, t('btn.close')),
          ),
          h('div', { className: 'dwb-sub' }, t('browse.hint')),
          h(
            'div',
            { className: 'dwb-row' },
            h('input', {
              className: 'dwb-input dwb-grow',
              style: { flex: '1 1 220px' },
              value: typed,
              placeholder: 'D:\\TavernBackups',
              onChange: (ev) => setTyped(ev.target.value),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') void load(typed)
              },
            }),
            h('button', { type: 'button', className: 'dwb-btn', onClick: () => void load(typed), disabled: busy }, t('browse.go')),
            h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void load(''), disabled: busy }, t('browse.drives')),
          ),
          failed ? h('div', { className: 'dwb-msg bad' }, failed) : null,
          view && view.error ? h('div', { className: 'dwb-msg bad' }, view.error) : null,
          h(
            'div',
            { className: 'dwb-browse' },
            view && view.parent
              ? h(
                  'button',
                  { type: 'button', className: 'dwb-item', onClick: () => void load(view.parent) },
                  h('span', { className: 'dwb-up' }, '..'),
                  h('span', { className: 'dwb-item-name' }, t('browse.up')),
                )
              : null,
            entries.length
              ? entries.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.path,
                      type: 'button',
                      className: 'dwb-item',
                      onClick: () => void load(entry.path),
                      title: entry.path,
                    },
                    h('span', { className: 'dwb-up' }, entry.type === 'drive' ? '[·]' : '>'),
                    h('span', { className: 'dwb-item-name dwb-grow' }, entry.name),
                  ),
                )
              : h('div', { className: 'dwb-empty' }, t('browse.empty')),
          ),
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'span',
              { className: 'dwb-sub dwb-grow' },
              view && view.dir && !view.drives ? view.dir : t('browse.pickHint'),
            ),
            h(
              'button',
              { type: 'button', className: 'dwb-btn primary', onClick: () => pickable && onPick(view.dir), disabled: !pickable },
              t('browse.pick'),
            ),
          ),
        ),
      )
    }

    function Field({ label, children }) {
      return h('label', { className: 'dwb-field' }, h('span', null, label), children)
    }

    /** 新增/编辑共用一张表单：字段一致，只有保存动作不同。 */
    function Editor({ state, cards, scopes, statuses, onChange, onSubmit, onCancel }) {
      const draft = state.draft
      const set = (key) => (ev) => onChange({ ...draft, [key]: ev.target.value })
      const tagText = Array.isArray(draft.tags) ? draft.tags.join(', ') : String(draft.tags || '')
      return h(
        'div',
        { className: 'dwb-card dwb-card flat' },
        h('div', { className: 'dwb-title' }, state.mode === 'edit' ? t('editor.edit') : t('editor.add')),
        h(
          'div',
          { className: 'dwb-grid2' },
          h(Field, { label: t('field.card') }, h(
            'select',
            { className: 'dwb-input', value: draft.cardKey, onChange: set('cardKey') },
            cards.map((c) => h('option', { key: c.key, value: c.key }, c.name)),
          )),
          h(Field, { label: t('field.title') }, h('input', {
            className: 'dwb-input',
            value: draft.title,
            placeholder: t('field.title.ph'),
            onChange: set('title'),
          })),
          h(Field, { label: t('field.status') }, h(
            'select',
            { className: 'dwb-input', value: draft.status, onChange: set('status') },
            statuses.map((s) => h('option', { key: s, value: s }, statusLabel(s))),
          )),
          h(Field, { label: t('field.scope') }, h(
            'select',
            { className: 'dwb-input', value: draft.scope, onChange: set('scope') },
            scopes.map((s) => h('option', { key: s, value: s }, s)),
          )),
        ),
        h(Field, { label: t('field.tags') }, h('input', {
          className: 'dwb-input',
          value: tagText,
          placeholder: t('field.tags.ph'),
          onChange: set('tags'),
        })),
        h(Field, { label: t('field.symptom') }, h('textarea', {
          className: 'dwb-area',
          value: draft.symptom,
          placeholder: t('field.symptom.ph'),
          onChange: set('symptom'),
        })),
        h(Field, { label: t('field.cause') }, h('textarea', {
          className: 'dwb-area',
          value: draft.cause,
          placeholder: t('field.cause.ph'),
          onChange: set('cause'),
        })),
        h(Field, { label: t('field.fix') }, h('textarea', {
          className: 'dwb-area',
          value: draft.fix,
          placeholder: t('field.fix.ph'),
          onChange: set('fix'),
        })),
        h(
          'div',
          { className: 'dwb-grid2' },
          h(Field, { label: t('field.refs') }, h('input', {
            className: 'dwb-input',
            value: draft.refs,
            placeholder: t('field.refs.ph'),
            onChange: set('refs'),
          })),
          h(Field, { label: t('field.evidence') }, h('input', {
            className: 'dwb-input',
            value: draft.evidence,
            placeholder: t('field.evidence.ph'),
            onChange: set('evidence'),
          })),
        ),
        h(
          'div',
          { className: 'dwb-row' },
          h(
            'button',
            { type: 'button', className: 'dwb-btn primary', onClick: onSubmit, disabled: !String(draft.title).trim() },
            t('btn.save'),
          ),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: onCancel }, t('btn.cancel')),
        ),
      )
    }

    /* ------------------------------------------------------------- panel */

    const EMPTY_DRAFT = {
      cardKey: '',
      title: '',
      symptom: '',
      cause: '',
      fix: '',
      scope: '卡片',
      status: 'open',
      tags: '',
      refs: '',
      evidence: '',
    }

    function Panel() {
      useStyles()

      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)
      const [log, setLog] = useState([])
      const [view, setView] = useState('entries')
      const [selectedKey, setSelectedKey] = useState('')
      const [query, setQuery] = useState('')
      const [filterStatus, setFilterStatus] = useState('')
      const [filterScope, setFilterScope] = useState('')
      const [editor, setEditor] = useState(null)
      const [lookup, setLookup] = useState(null)
      const [pending, setPending] = useState(null)
      const [importText, setImportText] = useState('')
      const [importOpen, setImportOpen] = useState(false)
      const [renameOpen, setRenameOpen] = useState(false)
      const [renameText, setRenameText] = useState('')
      const [bucketOpen, setBucketOpen] = useState(false)
      const [bucketText, setBucketText] = useState('')
      const [browse, setBrowse] = useState(null)
      const [scriptScan, setScriptScan] = useState(null)
      const [scriptBusy, setScriptBusy] = useState(false)
      const [reflux, setReflux] = useState(null)
      const [keepCount, setKeepCount] = useState(20)

      const push = useCallback((text, kind) => {
        setLog((prev) => [{ t: new Date().toLocaleTimeString(), text, kind: kind || 'info' }, ...prev].slice(0, 30))
      }, [])

      const load = useCallback(async () => {
        try {
          const res = await apiGet()
          setData(res)
          setSelectedKey((prev) => (prev && res.cards.some((c) => c.key === prev) ? prev : (res.cards[0] && res.cards[0].key) || ''))
          return res
        } catch (e) {
          const text = String(e && e.message ? e.message : e)
          setMessage({ kind: 'bad', text: `${t('err.bridge')}（${text}）` })
          return null
        }
      }, [])

      useEffect(() => {
        void load()
      }, [load])

      /**
       * 所有写操作走这里，保证「点了必有回音」。
       *
       * okText 为字符串就直接显示；需要拼上返回值的地方（比如新条目 id、
       * 备份份数）把 okText 传成 null，由调用方拿返回值自己组消息再覆盖。
       */
      const run = useCallback(
        async (payload, okText, hint) => {
          setBusy(true)
          try {
            const res = await apiPost(payload)
            if (!res || res.ok === false) {
              const text = `${okText || payload.action}：${(res && res.error) || 'failed'}`
              setMessage({ kind: 'bad', text })
              push(text, 'bad')
              return null
            }
            if (okText) {
              setMessage({ kind: 'ok', text: okText, hint: hint || '' })
              push(okText, 'ok')
            }
            await load()
            return res
          } catch (e) {
            const text = String(e && e.message ? e.message : e)
            setMessage({ kind: 'bad', text })
            push(text, 'bad')
            return null
          } finally {
            setBusy(false)
          }
        },
        [load, push],
      )

      // 跨卡查询走后台的检索：顺序由后台固定成「本卡在前、跨卡在后」，
      // 跟 wrongbook_lookup 工具返回的是同一套结果，界面上看到的就是调试时拿到的。
      useEffect(() => {
        const q = query.trim()
        if (!q) {
          setLookup(null)
          return undefined
        }
        const timer = setTimeout(() => {
          void (async () => {
            try {
              const res = await apiPost({
                action: 'lookup',
                card: selectedKey,
                query: q,
                status: filterStatus,
                scope: filterScope,
              })
              setLookup(res && res.ok ? res.result : null)
            } catch {
              setLookup(null)
            }
          })()
        }, 220)
        return () => clearTimeout(timer)
      }, [query, filterStatus, filterScope, selectedKey, data && data.updatedAt])

      const cards = (data && data.cards) || []
      const entries = (data && data.entries) || []
      const generalKey = (data && data.generalKey) || '__general__'
      const backups = (data && data.backups) || []

      // 分类分两组：人物卡（来自卡片目录）和其它（手建的，比如卡片更新器）。
      // 两个错题页签共用同一套渲染，只是换掉数据源。
      const groupOf = view === 'other' ? 'other' : 'card'
      const groupCards = cards.filter((c) => (c.group || 'card') === groupOf)
      const isOther = groupOf === 'other'
      const currentCard = groupCards.find((c) => c.key === selectedKey) || null

      /** 切页签时把选中项挪到该组里，否则右栏会显示上一组的分类。 */
      const pickView = (next) => {
        setView(next)
        // 备份与卡脚本两页跟"选中哪个分类"无关，别去动它。
        if (next !== 'entries' && next !== 'other') return
        const group = next === 'other' ? 'other' : 'card'
        const list = cards.filter((c) => (c.group || 'card') === group)
        if (!list.some((c) => c.key === selectedKey)) setSelectedKey(list[0] ? list[0].key : '')
      }

      // 卡脚本盘点按需拉取：它要读几张十几 MB 的卡，不该拖慢每次打开面板。
      useEffect(() => {
        if (view !== 'scripts' || scriptScan || scriptBusy) return undefined
        let alive = true
        setScriptBusy(true)
        fetch(`${BASE}/scripts`)
          .then((res) => res.json())
          .then((body) => {
            if (alive) setScriptScan(body && body.ok ? body : { cards: [], tools: [], error: (body && body.error) || '' })
          })
          .catch((e) => {
            if (alive) setScriptScan({ cards: [], tools: [], error: String(e && e.message ? e.message : e) })
          })
          .finally(() => {
            if (alive) setScriptBusy(false)
          })
        return () => {
          alive = false
        }
      }, [view, scriptScan, scriptBusy])

      const ownEntries = useMemo(() => {
        return entries
          .filter((e) => e.cardKey === selectedKey)
          .filter((e) => (filterStatus ? e.status === filterStatus : true))
          .filter((e) => (filterScope ? e.scope === filterScope : true))
          .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      }, [entries, selectedKey, filterStatus, filterScope])

      const openEditor = useCallback(
        (entry) => {
          if (!entry) {
            setEditor({
              mode: 'add',
              draft: { ...EMPTY_DRAFT, cardKey: selectedKey || generalKey },
            })
            return
          }
          setEditor({
            mode: 'edit',
            id: entry.id,
            draft: {
              cardKey: entry.cardKey,
              title: entry.title || '',
              symptom: entry.symptom || '',
              cause: entry.cause || '',
              fix: entry.fix || '',
              scope: entry.scope || '其他',
              status: entry.status || 'open',
              tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : String(entry.tags || ''),
              refs: entry.refs || '',
              evidence: entry.evidence || '',
            },
          })
        },
        [selectedKey, generalKey],
      )

      const submitEditor = useCallback(async () => {
        if (!editor) return
        const draft = editor.draft
        if (!String(draft.title).trim()) return
        if (editor.mode === 'edit') {
          await run({ action: 'updateEntry', id: editor.id, patch: draft }, t('ok.updated'))
        } else {
          const res = await run({ action: 'addEntry', cardKey: draft.cardKey, entry: draft }, null)
          if (res) {
            const card = cards.find((c) => c.key === res.entry.cardKey)
            setMessage({ kind: 'ok', text: t('ok.added').replace('{name}', card ? card.name : res.entry.cardKey) })
          }
        }
        setEditor(null)
      }, [editor, run, cards])

      const removeEntry = useCallback(
        async (entry) => {
          setPending(null)
          await run({ action: 'deleteEntry', id: entry.id }, t('ok.removed'))
        },
        [run],
      )

      const setStatus = useCallback(
        async (entry, status) => {
          await run({ action: 'updateEntry', id: entry.id, patch: { status } }, t('ok.updated'))
        },
        [run],
      )

      const copyTo = useCallback(
        async (entry, toCardKey) => {
          const res = await run({ action: 'copyEntry', id: entry.id, toCardKey }, null)
          if (res) {
            const card = cards.find((c) => c.key === toCardKey)
            setMessage({ kind: 'ok', text: t('ok.moved').replace('{name}', card ? card.name : toCardKey) })
          }
        },
        [run, cards],
      )

      const submitRename = useCallback(async () => {
        if (!currentCard) return
        await run({ action: 'renameCard', key: currentCard.key, name: renameText }, t('ok.renamed'))
        setRenameOpen(false)
      }, [currentCard, renameText, run])

      /** 新建「其它错题」分类，建完直接选中它，省一次点击。 */
      const submitBucket = useCallback(async () => {
        if (!bucketText.trim()) {
          setMessage({ kind: 'bad', text: t('err.bucketName') })
          return
        }
        const res = await run({ action: 'addBucket', name: bucketText }, null)
        if (res) {
          const text = t('ok.bucketAdded').replace('{name}', res.card.name)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
          setSelectedKey(res.card.key)
          setBucketOpen(false)
          setBucketText('')
        }
      }, [bucketText, run, push])

      /** 删分类不删记录：底下的条目会迁到「通用 / 未归类」。 */
      const removeBucket = useCallback(
        async (card) => {
          setPending(null)
          const res = await run({ action: 'deleteBucket', key: card.key }, null)
          if (res) {
            const text = t('ok.bucketRemoved').replace('{n}', res.moved)
            setMessage({ kind: 'ok', text, hint: t('bucket.deleteHint') })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const checkSelf = useCallback(async () => {
        const res = await run({ action: 'checkSelf' }, null)
        if (!res || !res.plugin) return
        const p = res.plugin
        const verdict =
          p.verdict === 'update-available'
            ? t('ver.available').replace('{v}', p.latestVersion || '')
            : p.verdict === 'changed-locally'
              ? t('ver.changed')
              : t('ver.upToDate')
        setMessage({
          kind: p.verdict === 'up-to-date' ? 'ok' : 'bad',
          text: `${p.version} · ${verdict}`,
        })
      }, [run])

      const exportAll = useCallback(async () => {
        const res = await apiPost({ action: 'exportAll' })
        if (!res || res.ok === false) {
          setMessage({ kind: 'bad', text: `${t('btn.export')}：${(res && res.error) || 'failed'}` })
          return
        }
        try {
          const blob = new Blob([res.json], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `wrongbook-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(url)
          setMessage({ kind: 'ok', text: t('ok.exported') })
          push(t('ok.exported'), 'ok')
        } catch (e) {
          setMessage({ kind: 'bad', text: String(e && e.message ? e.message : e) })
        }
      }, [push])

      const submitImport = useCallback(async () => {
        if (!importText.trim()) {
          setMessage({ kind: 'bad', text: t('err.emptyImport') })
          return
        }
        const res = await run({ action: 'importEntries', json: importText }, null)
        if (res) {
          const text = t('ok.imported').replace('{added}', res.added).replace('{skipped}', res.skipped)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
          setImportText('')
          setImportOpen(false)
        }
      }, [importText, run, push])

      const doBackup = useCallback(async () => {
        const res = await run({ action: 'backupNow' }, null)
        if (res) {
          const text = t('ok.backup').replace('{n}', res.backups)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
        }
      }, [run, push])

      const openDir = useCallback(
        async (which) => {
          const res = await run({ action: which === 'backup' ? 'openBackupDir' : 'openDataDir' }, null)
          if (res) {
            // 顺带报出走通了哪一级回退：这台机器上到底哪种方式有效，一眼可见。
            const via = res.via ? ` · ${res.via}` : ''
            const text = `${t('ok.opened').replace('{path}', res.opened || '')}${via}`
            setMessage({ kind: 'ok', text })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const deleteBackup = useCallback(
        async (file) => {
          setPending(null)
          const res = await run({ action: 'deleteBackup', file }, null)
          if (res) {
            const text = t('ok.deletedBackup').replace('{file}', file)
            setMessage({ kind: 'ok', text })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      const restoreBackup = useCallback(
        async (file) => {
          setPending(null)
          const res = await run({ action: 'restoreBackup', file }, null)
          if (res) {
            setMessage({
              kind: 'ok',
              text: t('ok.restored').replace('{n}', res.restored),
              hint: t('ok.restoredHint'),
            })
            push(t('ok.restored').replace('{n}', res.restored), 'ok')
          }
        },
        [run, push],
      )

      const pruneBackups = useCallback(async () => {
        const res = await run({ action: 'pruneBackups', keep: keepCount }, null)
        if (res) {
          const text = t('ok.pruned').replace('{n}', res.removed).replace('{keep}', res.keep)
          setMessage({ kind: 'ok', text })
          push(text, 'ok')
        }
      }, [run, push, keepCount])

      /** 保存备份目录；dir 传空串就是恢复默认。 */
      const applyBackupDir = useCallback(
        async (dir) => {
          setBrowse(null)
          const res = await run({ action: 'setBackupDir', dir }, null)
          if (res) {
            const text = res.custom ? t('ok.backupDir').replace('{dir}', res.backupDir) : t('ok.backupDirReset')
            setMessage({ kind: 'ok', text, hint: t('backup.dir.hint') })
            push(text, 'ok')
          }
        },
        [run, push],
      )

      /**
       * 打开目录浏览弹窗。
       *
       * 不用宿主的目录选择器 —— 参照卡片更新器的做法：那个能力在不在、
       * 能不能用都不一定，而「点一下什么也没发生」是最糟的结果。
       * 目录由 host 列，所以这条路一定有反应。
       */
      const chooseBackupDir = useCallback(() => {
        setBrowse({ initialPath: data ? data.paths.backupDir : '' })
      }, [data])

      const rescan = useCallback(async () => {
        const res = await run({ action: 'rescan' }, null)
        if (res) setMessage({ kind: 'ok', text: t('ok.rescan').replace('{n}', res.scanned) })
      }, [run])

      /* ------------------------------------------------- 回流到 Skill */

      /** 一条条目落进哪个范围 —— 决定回流传哪些。 */
      const entriesInScope = (scope) => {
        if (scope === 'card') return entries.filter((e) => e.cardKey === selectedKey)
        if (scope === 'active') return entries.filter((e) => e.status !== 'fixed')
        return entries
      }

      /**
       * 打开回流弹窗。
       *
       * 内置 skill 也一并拉回来，但面板上标成不可选 —— 它们在程序目录里，
       * 写了也会被下次更新整份覆盖，与其让人以为写成功了，不如当场说清。
       */
      const openReflux = () => {
        setReflux({
          skills: null,
          skill: '',
          file: 'references/错题库回流.md',
          scope: 'all',
          busy: true,
          message: '',
          newName: '',
          newDesc: '',
          creating: false,
          confirmDelete: '',
        })
        fetch(`${BASE}/skills`)
          .then((res) => res.json())
          .then((body) => {
            const list = (body && body.skills) || []
            const mine = list.filter((s) => !s.builtin)
            setReflux((prev) =>
              prev ? { ...prev, skills: list, skill: prev.skill || (mine[0] ? mine[0].name : ''), busy: false } : prev,
            )
          })
          .catch((e) => {
            setReflux((prev) => (prev ? { ...prev, skills: [], busy: false, message: String((e && e.message) || e) } : prev))
          })
      }

      const createRefluxSkill = async () => {
        const name = String(reflux.newName || '').trim()
        if (!name) return
        setReflux({ ...reflux, busy: true, message: '' })
        try {
          const res = await apiPost({
            action: 'createSkill',
            name,
            description: String(reflux.newDesc || '').trim(),
          })
          if (!res || res.ok === false) {
            setReflux((prev) => (prev ? { ...prev, busy: false, message: (res && res.error) || '' } : prev))
            return
          }
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  newName: '',
                  // 建完就把新建区收起来：留着展开的话，手一快就会连建好几个空壳
                  // （这会已经有过两回）。
                  creating: false,
                  skill: name,
                  message: t('reflux.created').replace('{name}', name),
                  skills: (prev.skills || []).concat([{ name, builtin: false, references: [], description: '', entries: 0 }]),
                }
              : prev,
          )
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      /**
       * 按当前范围和错题库实况生成一句简介。
       *
       * 原来只塞一个带尖括号的模板 —— 等于没帮上忙：写的人还是不知道自己该填什么。
       * 这里把它算成真实的：多少条、覆盖哪些范围、涉及哪些分类，直接能当简介用。
       */
      const buildSampleDesc = () => {
        const picked = entriesInScope(reflux.scope)
        if (!picked.length) return ''
        const tally = {}
        for (const entry of picked) tally[entry.scope] = (tally[entry.scope] || 0) + 1
        const scopes = Object.keys(tally)
          .sort((a, b) => tally[b] - tally[a])
          .slice(0, 5)
          .join('、')
        const names = [...new Set(picked.map((e) => e.cardKey))].map((key) => {
          const found = cards.find((c) => c.key === key)
          return found ? found.name : key
        })
        const head = names.slice(0, 5).join('、')
        const tail = names.length > 5 ? ` 等 ${names.length} 处` : ''
        const n = picked.length

        if (reflux.scope === 'card') {
          return `${names[0] || '这张卡'} 的已解决故障：${n} 条（${scopes}）。用户调试这张卡、或排查同类异常时，先翻一遍 —— 每条含现象、根因与修法。`
        }
        if (reflux.scope === 'active') {
          return `待解决的故障：${n} 条，涉及 ${head}${tail}，范围集中在 ${scopes}。排查这些问题、或遇到同类症状时先看这里 —— 每条含现象、根因与待验证的修法。`
        }
        return `已解决故障库：DSH Tavern 调试中踩过的 ${n} 个坑（${scopes}），涉及 ${head}${tail}。用户排查卡片异常、转 MVU、或调试插件与宿主时，先翻一遍看有没有同一类 —— 每条含现象、根因、修法与实测证据。`
      }

      /** 把算出来的简介塞进输入框；算不出来（没条目）就维持原样。 */
      const fillSampleDesc = () =>
        setReflux((prev) => {
          if (!prev) return prev
          const text = buildSampleDesc()
          return text ? { ...prev, newDesc: text } : prev
        })

      const deleteRefluxSkill = async () => {
        const name = reflux.skill
        if (!name) return
        setReflux({ ...reflux, busy: true, message: '', confirmDelete: '' })
        try {
          const res = await apiPost({ action: 'deleteSkill', name })
          if (!res || res.ok === false) {
            setReflux((prev) => (prev ? { ...prev, busy: false, message: (res && res.error) || '' } : prev))
            return
          }
          const rest = (reflux.skills || []).filter((s) => s.name !== name)
          const next = rest.filter((s) => !s.builtin)[0]
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  skills: rest,
                  skill: next ? next.name : '',
                  message: t('reflux.deleted').replace('{name}', name).replace('{backup}', res.backup || ''),
                }
              : prev,
          )
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      const doReflux = async () => {
        const picked = entriesInScope(reflux.scope)
        if (!reflux.skill || !picked.length) return
        setReflux({ ...reflux, busy: true, message: '' })
        const short = String(reflux.file).split('/').pop()
        try {
          const res = await apiPost({
            action: 'refluxToSkill',
            skill: reflux.skill,
            file: reflux.file,
            ids: picked.map((e) => e.id),
          })
          setReflux((prev) =>
            prev
              ? {
                  ...prev,
                  busy: false,
                  message:
                    res && res.ok !== false
                      ? res.written
                        ? t('reflux.done').replace('{n}', res.written).replace('{file}', short).replace('{m}', res.skipped)
                        : t('reflux.doneAllSkip').replace('{n}', res.skipped).replace('{file}', short)
                      : (res && res.error) || '',
                }
              : prev,
          )
        } catch (e) {
          setReflux((prev) => (prev ? { ...prev, busy: false, message: String((e && e.message) || e) } : prev))
        }
      }

      if (!data) {
        return h(
          'div',
          { className: 'dwb-root' },
          h('div', { className: 'dwb-wrap' }, h('div', { className: 'dwb-empty' }, message ? message.text : t('err.bridge'))),
        )
      }

      const plugin = data.plugin || {}
      const verdictChip = () => {
        if (plugin.updateAvailable) {
          return h('span', { className: 'dwb-chip ok' }, t('ver.available').replace('{v}', plugin.latestVersion || ''))
        }
        if (plugin.changedLocally) return h('span', { className: 'dwb-chip warn' }, t('ver.changed'))
        if (plugin.lastCheckAt) return h('span', { className: 'dwb-chip ok' }, t('ver.upToDate'))
        return h('span', { className: 'dwb-chip' }, t('ver.unknown'))
      }

      const selfHint = plugin.changedLocally
        ? t('ver.hint.changed').replace('{files}', (plugin.files || []).map((f) => f.rel).join(', '))
        : data.config && data.config.remoteUrl
          ? t('ver.hint.remote').replace('{url}', data.config.remoteUrl)
          : t('ver.hint.noRemote')

      /* --------------------------------------------------- 错题视图 */

      const entriesView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-hint' },
          view === 'scripts'
            ? t('scripts.hint')
            : isOther
              ? t('bucket.otherHint')
              : `${t('order.hint')} · ${selfHint} · ${t('reflux.panelHint')}`,
        ),
        // 工具条：跨卡查询与筛选。状态/范围筛选同时作用于本卡列表和跨卡检索。
        h(
          'div',
          { className: 'dwb-bar' },
          h('input', {
            className: 'dwb-input dwb-grow',
            style: { flex: '1 1 220px' },
            value: query,
            placeholder: t('search.ph'),
            onChange: (ev) => setQuery(ev.target.value),
          }),
          h(
            'select',
            { className: 'dwb-select', value: filterStatus, onChange: (ev) => setFilterStatus(ev.target.value) },
            h('option', { value: '' }, t('filter.status')),
            data.statuses.map((s) => h('option', { key: s, value: s }, statusLabel(s))),
          ),
          h(
            'select',
            { className: 'dwb-select', value: filterScope, onChange: (ev) => setFilterScope(ev.target.value) },
            h('option', { value: '' }, t('filter.scope')),
            data.scopes.map((s) => h('option', { key: s, value: s }, s)),
          ),
          h('span', { className: 'dwb-grow' }),
          h('button', { type: 'button', className: 'dwb-btn primary', onClick: () => openEditor(null) }, t('btn.add')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: rescan, disabled: busy }, t('btn.rescan')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: openReflux, disabled: busy }, t('reflux.open')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void load() }, t('btn.reload')),
        ),
        reflux
          ? h(RefluxModal, {
              state: reflux,
              entries,
              selectedKey,
              onChange: (patch) => setReflux({ ...reflux, ...patch }),
              onClose: () => setReflux(null),
              onWrite: doReflux,
              onCreate: createRefluxSkill,
              onDelete: deleteRefluxSkill,
              onSample: fillSampleDesc,
            })
          : null,
        editor
          ? h(Editor, {
              state: editor,
              cards: groupCards,
              scopes: data.scopes,
              statuses: data.statuses,
              onChange: (draft) => setEditor({ ...editor, draft }),
              onSubmit: submitEditor,
              onCancel: () => setEditor(null),
            })
          : null,
        h(
          'div',
          { className: 'dwb-cols' },
          h(
            'div',
            { className: 'dwb-card dwb-card flat' },
            h(
              'div',
              { className: 'dwb-row' },
              h('span', { className: 'dwb-sub dwb-grow' }, isOther ? t('cards.title.other') : t('cards.title')),
              isOther
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn tiny ghost',
                      onClick: () => {
                        setBucketText('')
                        setBucketOpen(true)
                      },
                    },
                    t('bucket.add'),
                  )
                : null,
              currentCard
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn tiny ghost',
                      onClick: () => {
                        setRenameText(currentCard.name)
                        setRenameOpen(true)
                      },
                    },
                    t('btn.rename'),
                  )
                : null,
              currentCard && currentCard.key !== generalKey && (isOther || currentCard.missing)
                ? h(ConfirmButton, {
                    label: t('btn.deleteBucket'),
                    armed: pending === `bucket:${currentCard.key}`,
                    onArm: () => setPending(`bucket:${currentCard.key}`),
                    onCancel: () => setPending(null),
                    onConfirm: () => removeBucket(currentCard),
                  })
                : null,
            ),
            // 新建分类也走内联输入：理由同改名。
            bucketOpen
              ? h(
                  'div',
                  { className: 'dwb-col' },
                  h('input', {
                    className: 'dwb-input',
                    value: bucketText,
                    placeholder: t('bucket.name.ph'),
                    onChange: (ev) => setBucketText(ev.target.value),
                  }),
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h('button', { type: 'button', className: 'dwb-btn tiny primary', onClick: submitBucket }, t('btn.save')),
                    h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setBucketOpen(false) }, t('btn.cancel')),
                  ),
                )
              : null,
            // 改名走内联输入：window.prompt 在 Electron 渲染进程里没有实现。
            renameOpen && currentCard
              ? h(
                  'div',
                  { className: 'dwb-col' },
                  h('div', { className: 'dwb-sub' }, t('rename.hint')),
                  h('input', {
                    className: 'dwb-input',
                    value: renameText,
                    onChange: (ev) => setRenameText(ev.target.value),
                  }),
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h('button', { type: 'button', className: 'dwb-btn tiny primary', onClick: submitRename }, t('btn.save')),
                    h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setRenameOpen(false) }, t('btn.cancel')),
                  ),
                )
              : null,
            groupCards.length
              ? h(
                  'div',
                  { className: 'dwb-list' },
                  groupCards.map((card) => h(CardRow, { key: card.key, card, active: card.key === selectedKey, onPick: setSelectedKey })),
                )
              : h('div', { className: 'dwb-empty' }, isOther ? t('bucket.empty') : t('cards.empty')),
          ),
          h(
            'div',
            { className: 'dwb-col', style: { gap: 10 } },
            currentCard
              ? h(
                  'div',
                  { className: 'dwb-card dwb-card flat' },
                  h(
                    'div',
                    { className: 'dwb-row' },
                    h(Avatar, { card: currentCard }),
                    h('span', { className: 'dwb-title dwb-grow' }, currentCard.name),
                    h('span', { className: 'dwb-sub' }, t('misc.count').replace('{n}', currentCard.count ? currentCard.count.total : 0)),
                  ),
                  currentCard.note ? h('div', { className: 'dwb-sub' }, currentCard.note) : null,
                  currentCard.abs ? h('div', { className: 'dwb-path' }, currentCard.rel) : null,
                  currentCard.missing ? h('div', { className: 'dwb-chip warn' }, t('cards.missing')) : null,
                )
              : null,
            // ① 本卡错题库。查询时后台会把本卡命中一并返回，这里只渲染那一段。
            h(
              'div',
              { className: 'dwb-card' },
              h('div', { className: 'dwb-title' }, isOther ? t('own.title.other') : t('own.title')),
              h('div', { className: 'dwb-sub' }, currentCard ? currentCard.name : ''),
              (lookup ? lookup.own : ownEntries).length
                ? h(
                    'div',
                    { className: 'dwb-entries' },
                    (lookup ? lookup.own : ownEntries).map((entry) =>
                      h(EntryView, {
                        key: entry.id,
                        entry,
                        cards,
                        pending,
                        setPending,
                        onEdit: openEditor,
                        onDelete: removeEntry,
                        onCopy: copyTo,
                        onStatus: setStatus,
                      }),
                    ),
                  )
                : h('div', { className: 'dwb-empty' }, t('own.empty')),
            ),
            // ② 其它错题 → ③ 跨卡查询。
            //
            // 中间那一段是给「归类偏了」准备的：归档位置可能不精确，但内容还在库里，
            // 不该因为落错了组就检索不到。它排在跨卡之前，因为插件与工具链上的坑
            // 影响的往往不止一张卡。两段都空时给一句总提示，不摆两个空框。
            lookup && (lookup.other.length || lookup.cross.length)
              ? h(
                  Fragment,
                  null,
                  lookup.other.length
                    ? h(
                        'div',
                        { className: 'dwb-card' },
                        h('div', { className: 'dwb-title' }, t('other.title')),
                        h('div', { className: 'dwb-sub' }, `${t('cards.title.other')} · ${lookup.otherTotal ?? lookup.other.length}`),
                        h(
                          'div',
                          { className: 'dwb-entries' },
                          lookup.other.map((entry) =>
                            h(EntryView, {
                              key: entry.id,
                              entry,
                              cards,
                              pending,
                              setPending,
                              onEdit: openEditor,
                              onDelete: removeEntry,
                              onCopy: copyTo,
                              onStatus: setStatus,
                            }),
                          ),
                        ),
                      )
                    : null,
                  lookup.cross.length
                    ? h(
                        'div',
                        { className: 'dwb-card' },
                        h('div', { className: 'dwb-title' }, t('cross.title')),
                        h('div', { className: 'dwb-sub' }, `${t('cards.title')} · ${lookup.crossTotal ?? lookup.cross.length}`),
                        h(
                          'div',
                          { className: 'dwb-entries' },
                          lookup.cross.map((entry) =>
                            h(EntryView, {
                              key: entry.id,
                              entry,
                              cards,
                              pending,
                              setPending,
                              onEdit: openEditor,
                              onDelete: removeEntry,
                              onCopy: copyTo,
                              onStatus: setStatus,
                            }),
                          ),
                        ),
                      )
                    : null,
                )
              : lookup
                ? h('div', { className: 'dwb-card' }, h('div', { className: 'dwb-empty' }, t('cross.empty')))
                : null,
          ),
        ),
      )

      /* ----------------------------------------------------- 卡脚本视图 */

      const scriptsView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'div',
              { className: 'dwb-sub dwb-grow' },
              scriptScan
                ? t('scripts.summary').replace('{n}', scriptScan.cards.length).replace('{flagged}', scriptScan.flagged)
                : t('scripts.loading'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dwb-btn tiny ghost',
                disabled: scriptBusy,
                onClick: () => setScriptScan(null),
              },
              t('btn.reload'),
            ),
          ),
          h('div', { className: 'dwb-hint' }, t('scripts.hint')),
          scriptScan && scriptScan.error ? h('div', { className: 'dwb-msg bad' }, scriptScan.error) : null,
          h(
            'div',
            { className: 'dwb-entries' },
            scriptScan && scriptScan.cards.length
              ? scriptScan.cards.map((card) => h(CardScriptBlock, { key: card.key, card }))
              : h('div', { className: 'dwb-empty' }, scriptScan ? t('scripts.empty') : t('scripts.loading')),
          ),
        ),
        scriptScan && scriptScan.tools.length
          ? h(
              'div',
              { className: 'dwb-card dwb-card flat' },
              h('div', { className: 'dwb-title' }, t('scripts.tools')),
              h('div', { className: 'dwb-sub' }, t('scripts.toolsHint')),
              h(
                'div',
                { className: 'dwb-entries' },
                scriptScan.tools.map((tool) =>
                  h(
                    'div',
                    { key: tool.rel, className: 'dwb-script-row' },
                    h('span', { className: 'dwb-mono dwb-grow' }, tool.rel),
                    h('span', { className: 'dwb-sub' }, `${Math.round(tool.bytes / 1024)} KB`),
                    tool.chars ? h('span', { className: 'dwb-chip' }, `${tool.chars} 字符`) : null,
                    tool.dataKeys && tool.dataKeys.length
                      ? h('span', { className: 'dwb-chip tag' }, `data: ${tool.dataKeys.join(', ')}`)
                      : null,
                  ),
                ),
              ),
            )
          : null,
      )

      /* --------------------------------------------------- 备份视图 */

      const backupView = h(
        Fragment,
        null,
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h('div', { className: 'dwb-title' }, t('backup.current')),
          h(
            'div',
            { className: 'dwb-stat' },
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('sec.own')),
              h('div', { className: 'dwb-stat-v' }, t('misc.entriesCount').replace('{n}', data.dataFile ? data.dataFile.entries : entries.length)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('cards.title')),
              h('div', { className: 'dwb-stat-v' }, t('misc.cardsCount').replace('{n}', cards.length)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, 'data.json'),
              h('div', { className: 'dwb-stat-v' }, fmtBytes(data.dataFile && data.dataFile.bytes)),
            ),
            h(
              'div',
              { className: 'dwb-stat-cell' },
              h('div', { className: 'dwb-stat-k' }, t('misc.updated')),
              h('div', { className: 'dwb-stat-v' }, fmtTime(data.dataFile && data.dataFile.updatedAt) || '—'),
            ),
          ),
          h('div', { className: 'dwb-path' }, data.dataFile ? data.dataFile.file : data.paths.dbFile),
          // 安装自检：Tavern 更新时会不会把插件从 profile 里抹掉，这里给个实时的答案。
          h(
            'div',
            { className: `dwb-msg ${data.install && data.install.ok ? 'ok' : 'bad'}` },
            data.install && data.install.ok
              ? t('install.ok')
              : h(
                  Fragment,
                  null,
                  h('div', null, t('install.bad')),
                  h('pre', { className: 'dwb-pre' }, (data.install && data.install.fix) || ''),
                ),
          ),
        ),
        // 备份目录可以改到别处（换盘、丢进同步盘都行）。改完只影响之后写入的备份。
        h(
          'div',
          { className: 'dwb-card dwb-card flat' },
          h(
            'div',
            { className: 'dwb-row' },
            h('div', { className: 'dwb-stat-k dwb-grow' }, t('backup.dir.title')),
            data.paths.backupDirCustom ? h('span', { className: 'dwb-chip warn' }, t('backup.dir.custom')) : null,
          ),
          h('div', { className: 'dwb-path' }, data.paths.backupDir),
          h(
            'div',
            { className: 'dwb-row' },
            h('button', { type: 'button', className: 'dwb-btn', onClick: chooseBackupDir, disabled: busy }, t('backup.dir.pick')),
            data.paths.backupDirCustom
              ? h(
                  'button',
                  { type: 'button', className: 'dwb-btn ghost', onClick: () => applyBackupDir(''), disabled: busy },
                  t('backup.dir.reset'),
                )
              : null,
          ),
        ),
        h(
          'div',
          { className: 'dwb-bar' },
          h('button', { type: 'button', className: 'dwb-btn primary', onClick: doBackup, disabled: busy }, t('btn.backup')),
          h('span', { className: 'dwb-grow' }),
          h('span', { className: 'dwb-sub' }, `${t('field.keep')} `),
          h('input', {
            className: 'dwb-input narrow',
            type: 'number',
            min: 1,
            max: 60,
            value: keepCount,
            onChange: (ev) => setKeepCount(Math.max(1, Math.min(60, Number(ev.target.value) || 1))),
          }),
          h('button', { type: 'button', className: 'dwb-btn', onClick: pruneBackups, disabled: busy }, t('btn.prune')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void openDir('backup') }, t('btn.openBackup')),
          h('button', { type: 'button', className: 'dwb-btn ghost', onClick: () => void openDir('data') }, t('btn.openData')),
        ),
        h('div', { className: 'dwb-hint' }, t('backup.keepHint')),
        h(
          'div',
          { className: 'dwb-card' },
          h(
            'div',
            { className: 'dwb-row' },
            h('span', { className: 'dwb-title dwb-grow' }, t('backup.list')),
            h('span', { className: 'dwb-sub' }, t('misc.backups').replace('{n}', backups.length)),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: () => setImportOpen(!importOpen) }, t('btn.import')),
            h('button', { type: 'button', className: 'dwb-btn tiny ghost', onClick: exportAll }, t('btn.export')),
          ),
          // 导入用面板内的文本框：这里以前是 window.prompt，在 Electron 里没反应。
          importOpen
            ? h(
                'div',
                { className: 'dwb-col' },
                h('div', { className: 'dwb-sub' }, t('import.hint')),
                h('textarea', {
                  className: 'dwb-area tall',
                  value: importText,
                  onChange: (ev) => setImportText(ev.target.value),
                  placeholder: '{ "entries": [ { "cardKey": "cards/xxx.json", "title": "…" } ] }',
                }),
                h(
                  'div',
                  { className: 'dwb-row' },
                  h('button', { type: 'button', className: 'dwb-btn primary', onClick: submitImport, disabled: busy }, t('import.submit')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dwb-btn ghost',
                      onClick: () => {
                        setImportOpen(false)
                        setImportText('')
                      },
                    },
                    t('btn.cancel'),
                  ),
                ),
              )
            : null,
          backups.length
            ? h(
                'div',
                { className: 'dwb-backups' },
                backups.map((b) =>
                  h(
                    'div',
                    { key: b.file, className: 'dwb-backup' },
                    h('span', { className: 'dwb-backup-time dwb-grow' }, fmtTime(b.at)),
                    h('span', { className: 'dwb-chip' }, b.reason || '—'),
                    h('span', { className: 'dwb-chip' }, b.entries >= 0 ? t('backup.entries').replace('{n}', b.entries) : t('backup.entriesUnknown')),
                    h('span', { className: 'dwb-sub' }, fmtBytes(b.bytes)),
                    h(ConfirmButton, {
                      label: t('btn.restore'),
                      armed: pending === `restore:${b.file}`,
                      onArm: () => setPending(`restore:${b.file}`),
                      onCancel: () => setPending(null),
                      onConfirm: () => restoreBackup(b.file),
                    }),
                    h(ConfirmButton, {
                      label: t('btn.remove'),
                      armed: pending === `backup:${b.file}`,
                      onArm: () => setPending(`backup:${b.file}`),
                      onCancel: () => setPending(null),
                      onConfirm: () => deleteBackup(b.file),
                    }),
                  ),
                ),
              )
            : h('div', { className: 'dwb-empty' }, t('backup.empty')),
        ),
      )

      return h(
        'div',
        { className: 'dwb-root' },
        h(
          'div',
          { className: 'dwb-wrap' },
          // 头部：左是身份，右是检测更新和当前版本，跟卡片更新器同一版式。
          h(
            'div',
            { className: 'dwb-header' },
            h(
              'div',
              { className: 'dwb-grow' },
              h('div', { className: 'dwb-title' }, t('panel.title')),
              h('div', { className: 'dwb-sub' }, t('panel.desc')),
              h('div', { className: 'dwb-path' }, data.paths.dataDir),
            ),
            h(
              'div',
              { className: 'dwb-header-actions' },
              h('span', { className: `dwb-ver dwb-chip${plugin.changedLocally ? ' warn' : ''}` }, `v${plugin.version || '?'}`),
              verdictChip(),
              h(
                'button',
                { type: 'button', className: 'dwb-btn', onClick: checkSelf, disabled: busy },
                t('btn.checkSelf'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dwb-row' },
            h(
              'div',
              { className: 'dwb-tabs' },
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'entries' ? ' on' : ''}`, onClick: () => pickView('entries') },
                t('tab.entries'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'other' ? ' on' : ''}`, onClick: () => pickView('other') },
                t('tab.other'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'scripts' ? ' on' : ''}`, onClick: () => pickView('scripts') },
                t('tab.scripts'),
              ),
              h(
                'button',
                { type: 'button', className: `dwb-tab${view === 'backup' ? ' on' : ''}`, onClick: () => pickView('backup') },
                t('tab.backup'),
              ),
            ),
            h('span', { className: 'dwb-grow' }),
            h('span', { className: 'dwb-sub' }, t('misc.entriesCount').replace('{n}', entries.length)),
          ),
          message
            ? h(
                'div',
                { className: `dwb-msg ${message.kind}` },
                h('span', null, message.text),
                message.hint ? h('span', { className: 'dwb-sub' }, message.hint) : null,
              )
            : null,
          view === 'backup' ? backupView : view === 'scripts' ? scriptsView : entriesView,
          h(
            'div',
            { className: 'dwb-card dwb-card flat' },
            h('div', { className: 'dwb-sub' }, t('misc.log')),
            log.length
              ? h('div', { className: 'dwb-log' }, log.map((l) => `${l.t}  ${l.text}`).join('\n'))
              : h('div', { className: 'dwb-sub' }, '—'),
          ),
        ),
        browse
          ? h(BrowseModal, {
              initialPath: browse.initialPath,
              onPick: (dir) => void applyBackupDir(dir),
              onClose: () => setBrowse(null),
            })
          : null,
      )
    }

    function SettingsSection() {
      return h(Panel, null)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-wrongbook: dictionary')
      const bound = ctx.locale.bind(NS)
      translate = (key) => {
        try {
          return bound(key)
        } catch {
          return key
        }
      }

      // 目录选择走自己的浏览弹窗（见 BrowseModal），不依赖宿主的目录选择器。

      // 只占设置里的一个页面。左下角侧栏不注册任何东西 —— 入口只有一个。
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'wrongbook',
            order: 46,
            label: () => t('nav'),
            locale: NS,
          },
          SettingsSection,
        ),
      )
    }

    return { name: 'dsh-wrongbook', inject: ['slots', 'locale'], apply }
  },
})
