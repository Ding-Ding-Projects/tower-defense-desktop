/**
 * The site's string table: English and playful Hong Kong Cantonese, side by side so
 * a missing Cantonese line is obvious at review time rather than discovered later at
 * runtime. Consumed through site/scripts/i18n-core.mjs, which is what actually
 * resolves a key for the active language mode and falls back to English when needed.
 */

export const strings = {
  en: {
    'app.name': 'Tower Defence Desktop',
    'app.tagline': 'A deterministic tower defense game for Windows',

    'nav.overview': 'Overview',
    'nav.features': 'Features',
    'nav.docs': 'Documentation',
    'nav.download': 'Download',
    'nav.settings': 'Settings',
    'nav.about': 'About',

    'skip.toContent': 'Skip to content',

    'overview.title': 'A tower defense game that replays exactly the same way twice',
    'overview.subtitle':
      'Built for mechanical and statistical parity with Roblox Tower Defense Simulator, with every number sourced from the public wiki and cited in the data files themselves.',
    'overview.body1':
      'The simulation runs on a fixed 30 Hz tick, a single seeded random stream and fixed-point positions, so a match can be replayed exactly from its seed and command log.',
    'overview.body2':
      'Towers, enemies, maps, waves, difficulties and status effects are all validated JSON rows rather than code, so a new tower is meant to be a data row, not a new branch in the damage system.',
    'overview.status.title': 'Where the project actually stands',
    'overview.status.body':
      'This is early construction. The status badges on the Features page are real: most of the game is still designed rather than built. Nothing here claims to be finished when it is not.',
    'overview.cta.explore': 'See every feature',
    'overview.cta.download': 'Go to Download',

    'features.title': 'Every feature, and its real status',
    'features.subtitle':
      'Each card names one feature of the game, its current build status, and where it is documented in depth.',
    'features.search.placeholder': 'Filter features',
    'features.status.shipped': 'Shipped',
    'features.status.in-progress': 'In progress',
    'features.status.planned': 'Planned',
    'features.readMore': 'Read the full article',
    'features.empty': 'No feature matches that filter.',

    'docs.title': 'Documentation',
    'docs.subtitle':
      'One article per feature: behaviour, configuration, failure modes, security considerations and how to verify it, loaded entirely from a local bundle with no network request.',
    'docs.search.placeholder': 'Filter articles',
    'docs.empty': 'No article matches that filter.',
    'docs.suggested': 'Suggested next articles',
    'docs.selectPrompt': 'Choose an article from the list to read it here.',

    'download.title': 'Download',
    'download.subtitle': 'The installer is a real, verified release asset, never a guessed link.',
    'download.none.title': 'No release has been published yet',
    'download.none.body':
      'This project has not shipped an installer. When a release is published, its exact asset link, version and checksum will appear here automatically; until then, there is deliberately nothing to click.',
    'download.button': 'Download the Windows installer',
    'download.version.label': 'Version',
    'download.published.label': 'Published',
    'download.unsigned.notice':
      'The installer is unsigned. Windows will show an unknown-publisher warning; that is expected and does not mean the download is unofficial.',

    'settings.title': 'Settings',
    'settings.subtitle': 'Changes apply immediately and are remembered on this device.',
    'settings.theme.label': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.system': 'Match system',
    'settings.density.label': 'Density',
    'settings.density.comfortable': 'Comfortable',
    'settings.density.compact': 'Compact',
    'settings.density.spacious': 'Spacious',
    'settings.accent.label': 'Accent colour',
    'settings.accent.hue': 'Hue',
    'settings.accent.sat': 'Saturation',
    'settings.accent.light': 'Lightness',
    'settings.font.label': 'Font',
    'settings.font.latin': 'Roboto Flex (Latin-first)',
    'settings.font.cjk': 'Noto Sans HK (CJK-first)',
    'settings.language.label': 'Language',
    'settings.language.en': 'English',
    'settings.language.yue': 'Cantonese',
    'settings.language.bilingual': 'Bilingual',
    'settings.tabdock.label': 'Tab strip position',
    'settings.tabdock.top': 'Top',
    'settings.tabdock.start': 'Side',
    'settings.reset': 'Reset to defaults',
    'settings.saved': 'Settings saved on this device',

    'about.title': 'About this site',
    'about.subtitle': 'What this documentation site is, and is not.',
    'about.body':
      'This is the landing and documentation site for Tower Defence Desktop, a public, in-development project. It ships no assets, code or written text from Tower Defense Simulator; it reimplements mechanics and republishes statistics that are already public on that game’s wiki, cited row by row in the data files.',
    'about.licence.title': 'Licence and attribution',
    'about.licence.body':
      'Tower Defense Simulator is the work of its own authors. This is an independent reimplementation project and is not affiliated with or endorsed by them.',

    'search.regex.toggle': 'Use regular expression',
    'search.regex.test.label': 'Test pattern against',
    'search.regex.test.placeholder': 'Type text to test the pattern against',
    'search.regex.invalid': 'That is not a valid regular expression',
    'search.regex.matches': '{count} match(es)',
    'search.clear': 'Clear',

    'notifications.dismiss': 'Dismiss notification',
    'notifications.welcome': 'Welcome back. Your settings from last time are still here.',
    'notifications.settingsApplied': 'Setting applied',

    'tabs.more': 'More tabs',
    'tabs.pin': 'Pin tab',
    'tabs.unpin': 'Unpin tab',
    'tabs.moveLeft': 'Move earlier',
    'tabs.moveRight': 'Move later',
    'tabs.group': 'Add to a group',
    'tabs.ungroup': 'Remove from group',
    'tabs.newGroupName': 'New group name',

    'common.close': 'Close',
    'footer.text': 'Tower Defence Desktop — an independent, in-development project.',
  },

  yue: {
    'app.name': '塔防 Desktop',
    'app.tagline': '一個 Windows 塔防遊戲，玩幾多次都係嗰個結果',

    'nav.overview': '概覽',
    'nav.features': '功能',
    'nav.docs': '文件',
    'nav.download': '下載',
    'nav.settings': '設定',
    'nav.about': '關於',

    'skip.toContent': '跳去主要內容',

    'overview.title': '呢個塔防遊戲，playback 兩次都係一模一樣',
    'overview.subtitle':
      '目標係同 Roblox Tower Defense Simulator 喺機制同數值上睇齊，每個數字都抄自公開 wiki，仲喺資料檔入面寫明出處。',
    'overview.body1':
      '模擬用固定 30 Hz 嘅 tick、一條有種子嘅隨機數列，同埋定點數座標，所以一場對戰可以由種子同指令紀錄一五一十重播返一次。',
    'overview.body2':
      '塔、怪、地圖、波次、難度同狀態效果全部都係經過驗證嘅 JSON 資料，唔係寫死喺 code 入面，所以加一隻新塔應該係加一行資料，唔係喺傷害系統度開多條分支。',
    'overview.status.title': '而家真正做到邊步',
    'overview.status.body':
      '呢個項目仲喺好初期。「功能」頁面嗰啲狀態標籤係真嘅：大部分遊戲內容仲係得個設計，未真正整好。冇做好嘅嘢，呢度唔會扮做好咗。',
    'overview.cta.explore': '睇晒全部功能',
    'overview.cta.download': '去下載頁',

    'features.title': '每個功能，同佢嘅真實狀態',
    'features.subtitle': '每張卡都寫住一個遊戲功能、而家做到邊步，同埋詳細文件喺邊度睇。',
    'features.search.placeholder': '篩選功能',
    'features.status.shipped': '已完成',
    'features.status.in-progress': '進行緊',
    'features.status.planned': '仲喺計劃',
    'features.readMore': '睇完整文件',
    'features.empty': '搵唔到夾嗰個篩選條件嘅功能。',

    'docs.title': '文件',
    'docs.subtitle':
      '每個功能一篇文件：行為、設定、可能出錯嘅情況、安全考慮同點樣驗證，全部由本機打包載入，唔使上網攞。',
    'docs.search.placeholder': '篩選文件',
    'docs.empty': '搵唔到夾嗰個篩選條件嘅文件。',
    'docs.suggested': '建議接住睇嘅文件',
    'docs.selectPrompt': '喺左邊揀一篇文件，就會喺呢度顯示內容。',

    'download.title': '下載',
    'download.subtitle': '個安裝檔一定係真正、驗證過嘅 release 檔案，唔會係亂估嘅連結。',
    'download.none.title': '仲未出過任何 release',
    'download.none.body':
      '呢個項目仲未出過安裝檔。一旦出咗 release，佢實際嘅檔案連結、版本同校驗碼會自動顯示喺呢度；喺嗰之前，故意乜都冇得撳。',
    'download.button': '下載 Windows 安裝檔',
    'download.version.label': '版本',
    'download.published.label': '發佈日期',
    'download.unsigned.notice':
      '呢個安裝檔未經簽署。Windows 會彈出「未知發行者」嘅警告，呢個係預期之內，唔代表個下載唔官方。',

    'settings.title': '設定',
    'settings.subtitle': '改咗即刻生效，仲會記喺呢部機度。',
    'settings.theme.label': '主題',
    'settings.theme.light': '淺色',
    'settings.theme.dark': '深色',
    'settings.theme.system': '跟系統',
    'settings.density.label': '疏密程度',
    'settings.density.comfortable': '舒適',
    'settings.density.compact': '緊湊',
    'settings.density.spacious': '寬鬆',
    'settings.accent.label': '主色調',
    'settings.accent.hue': '色相',
    'settings.accent.sat': '飽和度',
    'settings.accent.light': '明度',
    'settings.font.label': '字體',
    'settings.font.latin': 'Roboto Flex（拉丁字母優先）',
    'settings.font.cjk': 'Noto Sans HK（中文優先）',
    'settings.language.label': '語言',
    'settings.language.en': '英文',
    'settings.language.yue': '廣東話',
    'settings.language.bilingual': '雙語',
    'settings.tabdock.label': '分頁列位置',
    'settings.tabdock.top': '頂部',
    'settings.tabdock.start': '側邊',
    'settings.reset': '重設返預設值',
    'settings.saved': '設定已經儲存喺呢部機',

    'about.title': '關於呢個網站',
    'about.subtitle': '呢個文件網站係咩，同埋唔係咩。',
    'about.body':
      '呢個係 Tower Defence Desktop 嘅著陸同文件網站，一個公開、仲喺開發緊嘅項目。呢度冇用任何 Tower Defense Simulator 嘅素材、code 或者文字；只係重新實現機制，同重新發佈嗰個遊戲 wiki 上面已經公開嘅數值，逐行寫明出處。',
    'about.licence.title': '版權同歸屬',
    'about.licence.body':
      'Tower Defense Simulator 係佢自己作者嘅作品。呢個係一個獨立嘅重新實現項目，同原作者冇任何關係，都冇經過佢哋認可。',

    'search.regex.toggle': '用正則表達式',
    'search.regex.test.label': '拎嚟試嘅文字',
    'search.regex.test.placeholder': '打啲文字，試下夾唔夾個 pattern',
    'search.regex.invalid': '呢個唔係一個有效嘅正則表達式',
    'search.regex.matches': '夾中 {count} 次',
    'search.clear': '清空',

    'notifications.dismiss': '收埋呢個通知',
    'notifications.welcome': '返嚟喇。上次嘅設定仲喺度，冇走樣。',
    'notifications.settingsApplied': '設定已經生效',

    'tabs.more': '更多分頁',
    'tabs.pin': '釘住分頁',
    'tabs.unpin': '解除釘住',
    'tabs.moveLeft': '移前少少',
    'tabs.moveRight': '移後少少',
    'tabs.group': '加入分組',
    'tabs.ungroup': '移出分組',
    'tabs.newGroupName': '新分組名稱',

    'common.close': '關閉',
    'footer.text': 'Tower Defence Desktop —— 一個獨立、仲喺開發緊嘅項目。',
  },
};
