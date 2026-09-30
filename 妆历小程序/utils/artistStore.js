/**
 * 妆师端 · 资料存储（M0 纯前端：写本机 storage）。
 * M1 换成云开发的 artists 集合 —— 调用方一行不动。
 *
 * ══════════════════════════════════════════════════════════════════════
 * 这个文件是全项目唯一持有「妆娘资料」的地方。它守住两件事：
 *
 * ① ⛔ 永远没有 wechat_id 这个字段。
 *    微信号的唯一出口仍然是 utils/contact.js（对应云函数 showContact）。
 *    saveArtist 的白名单会丢掉任何不在名单里的键 —— 所以哪怕调用方
 *    传进来一个 wechat_id，也进不了这里。微信号只可能作为【普通文本】
 *    出现在 intro 字符串里，永远不会变成一个能被程序读出来的字段。
 *    （简介里写微信号是允许的，那是她自己写的正文，不是数据库字段。）
 *
 * ② style_text 是【派生字段】—— 只在这里算，⛔ 从不落 storage。
 *    style_text 派生自 style_tags ∪ style_custom（预设词 + 她自填的词），
 *    于是 landing / guest-home / mine / my-profile 四个 wxml 的
 *    `{{artist.style_text}}` 一个字都不用改，接妆风格一改它们全都跟着变。
 *    只有一份真相：style_tags（闭合，只装预设词）+ style_custom（只装自填词）。
 *    ⚠️ 反面同样要守住：⛔ 别把派生值写回 storage —— 那就成了第二份真相，
 *       迟早跟 style_tags 对不上，而且是【静默】对不上。
 *
 * ③ avatar_color 存的是【颜色令牌】（`'rose'` / `'blue'` …），⛔ 不是色值。
 *    令牌从 AVATAR_COLORS 那一份闭集里取，认不出的一律回落 AVATAR_COLOR_DEFAULT。
 *    🔴 为什么不存 `#C0556E` 这种：storage 是本机可以被手改的（也是 M1 要挪到
 *       云端的一份数据）。存色值等于把一个【任意字符串】接进 `style="…"` 的位置；
 *       存令牌则整个颜色域只有 6 个可能值，画出来的一定是个头像。
 *       ⚠️ 令牌 → 颜色的映射【只住在 app.wxss 的 `.c-*` 里】（一处实现，规矩 11）。
 * ══════════════════════════════════════════════════════════════════════
 */
const KEY = 'zhuangli_artist'
const { ARTIST_PUBLIC, STYLE_GROUPS } = require('../mock/data')
const { TOAST } = require('./toast')

const NICKNAME_MAX = 12
const CITY_MAX = 12
const INTRO_MAX = 200

/* 2026-09-30（第十八处）· 妆娘自填风格词的配额。
   🔴 这两个常量是【唯一的上限来源】：页面上⛔ 不加 `maxlength`
      —— 这一页没有字数计数器，加了就是【静默截断】（她打第 11 个字时
      屏幕上什么都没发生，自己少打了什么也不知道），而下面那句
      「一个风格词最多 10 个字」会变成一句永远触发不了的死话术。
      让 store 拦、让页面出声（TOAST.STYLE_CUSTOM_LONG）。
   ⚠️ 10 字而不是 8：最长的预设词「日系 cos 妆」正好 8 个字，
      钉在 8 上就是个边界雷 —— 她打一个跟预设一样长的词反而被拦。 */
const CUSTOM_MAX = 6
const CUSTOM_MAX_LEN = 10

/* 认不出组名的自填词归到这里。
   ⚠️ 必须等于 mock/data.js STYLE_GROUPS 里的一个【真组名】（自测钉着）：
      归到一个不存在的组，那颗词会渲染成一行没有标题的孤魂。
   ⚠️ 为什么要有个兜底：`style_custom` 里记的是【显示名】（见下面的数据形状），
      词表里的组名哪天改了字，storage 里那批自填词就指不到组了。
      ⛔ 不许静默丢掉 —— 丢了她就再也删不掉它，而它还挂在分享页上、还占着名额。
      ⚠️ 更稳的做法是给 STYLE_GROUPS 加稳定的 group_id，但那个结构同时被
         booking-form 的顾客端妆感 chips 用着，这一轮不动它（记在 README §7）。 */
const GROUP_FALLBACK = '其他'

/* ⚠️ 必须跟 mock/data.js 里 ARTIST_PUBLIC.style_text 的分隔符【逐字一致】
   （空格 斜杠 空格）。差一个空格，往返断言当场红。
   🔴 也正因为它是分隔符，自填词里不许出现 `/`（见 validateCustomWord）。 */
const STYLE_SEP = ' / '

/* ══ 头像颜色（2026-09-30 第十九处）═══════════════════════════════════
   头像画的是【人像标识】（一个白脑袋 + 一副白肩膀，Drawn in app.wxss 的
   `.ava::before` / `.ava::after`），底色由妆娘自己挑。所以这里只需要一份
   【颜色令牌】的闭集，⛔ 不需要任何字、更不需要图片。

   🔴 令牌 = 唯一真相；色值住在 app.wxss 的 `.c-<token>` 里。
     · 加一个颜色 = 这里加一个字符串 + app.wxss 加一条 `.c-<token>` 规则。
       ⚠️ 两处必须同时加 —— 只加这边那颗会画成【透明底】，白脑袋看不见。
       自测里有一条断言逐字对着 app.wxss 的源码比这两份清单（双向都比：
       少一条规则 = 画不出来，多一条规则 = 死样式）。
     · rose = 第一位 = 默认，它的渐变逐字等于这一版之前所有头像的底色，
       所以「没选过颜色的老数据」和「新用户」看到的是同一张脸。

   ⚠️ 顺序就是调色板里的显示顺序，⛔ 别靠 sort 表达任何语义。
   ⚠️ 名字是【英文令牌】不是中文：它要做 CSS 类名（`.c-rose`）。
     中文类名在 WXSS 里能不能选中是另一回事，没必要赌。 */
const AVATAR_COLORS = ['rose', 'blue', 'green', 'amber', 'plum', 'slate']
const AVATAR_COLOR_DEFAULT = 'rose'

/* ══ 平台词表摊平（5 组 16 个预设词）═════════════════════════════════
   ⚠️ 来源是 mock/data.js 的 STYLE_GROUPS —— 那个文件自己写着「全站唯一来源」，
      ⛔ 不许在别处再抄一份 16 项的列表。
   📌 2026-09-30（第十八处）：这上面原先写着「决策：接妆风格只用固定词表多选，
      ⛔ 不开放自定义词」。用户把那条决定推翻了，原话：
      「接妆风格除了我列出的那些选项，妆面质感，场合，浓度 题材 其他
        妆娘可以自填选项，你只给了选项，用不着顾客搜，顾客搜不着就搜不着吧」
      🔴 而旧注释给的理由「顾客端要靠它筛人」——那句话**在代码里从来不存在**：
         4 个消费者（landing / guest-home / mine / my-profile）只显示 style_text，
         没有任何一处按风格词筛人。它是一条没落地的计划，⛔ 别拿它当反方论据。
      ⇒ 现在 ALL_TAGS 的含义是【预设词表】：
        预设通道只认它，自填词一律走 style_custom，两个通道【互不相交】。 */
const ALL_TAGS = (function () {
  const out = []
  STYLE_GROUPS.forEach(function (g) {
    (g.items || []).forEach(function (w) { if (out.indexOf(w) < 0) out.push(w) })
  })
  return out
})()

/* ────────────────────────────────────────────────────────────────────
   纯函数区（这一半进得了 node 自测，不打桩 wx）
   ──────────────────────────────────────────────────────────────────── */

/* 反推：把一句风格的文案拆回标签数组。
   ⚠️ 只用来【兜底不完整的旧数据】（老 storage 里只有 style_text、
      没有 style_tags 的那种）。⛔ 别拿它当正常读路径 —— 正常读路径读 style_tags。
   ⚠️ 它【不过滤】词表外的词（滤不滤由调用方决定：展示要滤、别的用途未必）。
   🔴 也正因为它是拿 `/` 切的，自填词里【不许出现 `/`】——
      否则那个词会被悄悄劈成两个（validateCustomWord 有专门一条闸）。 */
function splitStyleText(text) {
  return String(text == null ? '' : text)
    .split('/')
    .map(function (s) { return s.trim() })
    .filter(function (s) { return !!s })
}

/* 正向：标签数组 → 一句话。
   ⚠️ 预设词按【词表顺序】排，⛔ 不是点击顺序 —— 同一组标签换个点击次序就换一段
      文案的话，分享页上的字会莫名其妙地变，而她什么都没改。
   ⚠️ 自填词（词表外的）**按入参顺序**跟在预设词后面。
      📌 这是【显式拼接】，⛔ 不是靠 sort 的稳定性把"词表外的沉到最后"。
         原先那版靠 sort 稳定性表达同一件事，读起来像巧合、换引擎就说不准。
   ⚠️ 去重 + 滤空。
   ⚠️ 它和 splitStyleText 【不是严格互逆】：split 丢掉的是分隔符的写法，
      所以对任意字符串 `build(split(t)) !== t`。真正成立的是两条：
        ① split(build(tags)) === tags   （tags 已 trim、无空段、无重复时）
        ② build(split(t)) 幂等
      自测里两条都钉了。只钉一条会让人误以为它是双射。 */
function buildStyleText(tags) {
  const uniq = []
  ;(Array.isArray(tags) ? tags : []).forEach(function (w) {
    if (w && uniq.indexOf(w) < 0) uniq.push(w)
  })
  const presets = uniq.filter(function (w) { return ALL_TAGS.indexOf(w) >= 0 })
  const others = uniq.filter(function (w) { return ALL_TAGS.indexOf(w) < 0 })
  presets.sort(function (a, b) { return ALL_TAGS.indexOf(a) - ALL_TAGS.indexOf(b) })
  return presets.concat(others).join(STYLE_SEP)
}

/* 头像颜色令牌的消毒 —— 🔴 唯一一处（读和写都过它）。
   不认识的令牌（手改过的 storage、M1 里别人写坏的数据）一律回落默认色，
   ⛔ 不报错、也不原样透出去：透出去的结果是一个【透明底的头像】，
   白脑袋白肩膀贴在白卡片上 = 什么都没画，而屏幕上不会有一句话解释。

   ⛔ 注意它不是「读的时候悄悄改一下」：saveArtist 写入前也过这一道，
      所以 storage 里永远只可能是这 6 个令牌之一（自测钉着）。
   ⚠️ 输入先 String() 再 trim：`undefined` / 数字 / 带空格的 ' rose '
      都该被安安全全地吃进来，回落成一个能画出来的颜色。 */
function avatarColorOf(v) {
  const s = String(v == null ? '' : v).trim()
  return AVATAR_COLORS.indexOf(s) >= 0 ? s : AVATAR_COLOR_DEFAULT
}

/* ══ 自填词的遍历口 ═══════════════════════════════════════════════════
   `style_custom` 的形状（存进 storage 的就是它）：

       [{ group: '妆感质感', items: [{ name: '特效妆', on: true }] }]

   ⚠️ 组名就是【显示名】，不另有 id（见 GROUP_FALLBACK 那条注释的取舍）。
   ⚠️ `on` 是必须的：「词在列表里但这一轮没选用」是用户要的一个状态
      （2026-09-30 她定的：点词本体＝勾选/取消勾选，点 ✕ 才是删掉）。
   ⚠️ 只含有自填词的组 —— 空组不许留空壳（removeCustomTag 会把整条去掉）。
   🔴 eachCustom 是**唯一**的双层遍历实现：⛔ 别在页面或别的函数里再写一遍
      两层 forEach —— 顺序会各写各的，而顺序直接决定 style_text 那行字。 */
function eachCustom(custom, fn) {
  ;(Array.isArray(custom) ? custom : []).forEach(function (g) {
    const group = (g && g.group) || ''
    const items = (g && Array.isArray(g.items)) ? g.items : []
    items.forEach(function (it) {
      fn({ group: group, name: (it && it.name) || '', on: !!(it && it.on) })
    })
  })
}

/* 组名认得出来吗。⚠️ 判据是「在 STYLE_GROUPS 里」（⛔ 不是「非空」）。 */
function isValidGroup(name) {
  return STYLE_GROUPS.some(function (g) { return g.group === name })
}

/* 自填词的消毒 —— 🔴 唯一一处，读的时候一律先过它。
   按顺序做三件事：
     ① trim 掉首尾空白（纯空白的词直接丢 —— 空词画出来是一个空 chip）；
     ② 认不出的组名归 GROUP_FALLBACK（见那条常量的注释：⛔ 不丢）；
     ③ 同一个词只留第一颗（按小写比，存的还是她打的那个写法）
        —— 重复的那颗是【同一句话的副本】，去掉不丢信息。
   ⚠️ 【故意不截到 CUSTOM_MAX】：手改过的 storage 里真有第 7 颗的话，
      surfacing 出来（她看得见、删得掉、保存时被拦并被告知删一个）
      比静默砍掉强 —— 砍掉 = 那颗词她再也删不掉，而它还在分享页上。
   ⚠️ 顺带把同名的组并成一条（手改数据可能造出两条 '浓度'）。
   ⚠️ 返回的分组按【平台词表次序】排，⛔ 不是按她添加的先后（见 byGroupOrder）——
      否则同一批词按不同先后加进去，style_text 会长得不一样。 */
/* 按【平台词表的组序】给分组排序（认不出的组排最后；组内保持原次序，
   因为 Array#sort 是稳定的，同组元素的相对次序原样保留）。
   🔴 这一步是「文字只由数据决定」的关键：她先加「浓度」的词、还是先加「题材」的，
      存下来的数组次序不一样，但 style_text 必须一样 —— ⛔ 别把这一段删了。
      它也顺手让落库的次序和屏幕上 chip 的次序一致（界面就是按 STYLE_GROUPS 铺的）。 */
function byGroupOrder(secs) {
  const rank = function (g) {
    let i = -1
    STYLE_GROUPS.forEach(function (x, n) { if (x.group === g) i = n })
    return i < 0 ? STYLE_GROUPS.length : i
  }
  return secs.slice().sort(function (a, b) { return rank(a.group) - rank(b.group) })
}

function normalizeCustom(custom) {
  const seen = {}
  const byGroup = {}
  const order = []
  eachCustom(custom, function (c) {
    const name = String(c.name == null ? '' : c.name).trim()
    if (!name) return
    const k = name.toLowerCase()
    if (seen[k]) return
    seen[k] = true
    const g = isValidGroup(c.group) ? c.group : GROUP_FALLBACK
    if (!byGroup[g]) { byGroup[g] = []; order.push(g) }
    byGroup[g].push({ name: name, on: c.on })
  })
  return byGroupOrder(order.map(function (g) { return { group: g, items: byGroup[g] } }))
}

/* 消毒后的自填词名（扁平，按 组序 + 组内序）。 */
function customWords(custom) {
  const out = []
  eachCustom(normalizeCustom(custom), function (c) { out.push(c.name) })
  return out
}

/* ══ 生效的风格词 = 预设 ∪ 自填（🔴 唯一一处算这个并集的地方）════════
   · 预设：∩ ALL_TAGS，按【词表顺序】
   · 自填：只收 `on` 的，按【组序 + 组内序】
   ⚠️ 顺序必须是【数据的函数】，⛔ 不是添加历史的函数 —— 同一批词，
      先加 A 后加 B 和先加 B 后加 A 必须得到同一句 style_text
      （buildStyleText 那条契约：文字只由集合决定，不由操作顺序决定）。
   ⛔ 页面不许自己 concat 一份 —— 那就是第二处真相。
   📌 它【不落 storage】：style_text 和它是同一类东西（派生值）。 */
function allStyleWords(presets, custom) {
  const out = []
  const set = {}
  ;(Array.isArray(presets) ? presets : []).forEach(function (w) { set[w] = true })
  ALL_TAGS.forEach(function (w) { if (set[w] && out.indexOf(w) < 0) out.push(w) })
  eachCustom(normalizeCustom(custom), function (c) {
    if (c.on && out.indexOf(c.name) < 0) out.push(c.name)
  })
  return out
}

/* 预设通道的唯一读法（getArtist 和 getStyleState 共用，⛔ 不各写一遍）。
   · 形状对（是数组）就用它 —— **空数组也算数**
   · 形状不对才拿 style_text 反推（老 storage 只存了 style_text 那种）
   · 两种来源都要滤掉词表外的词：老数据里的垃圾继续滤掉，
     ⛔ 不搬进 style_custom（搬进去 = 把它永久写进顾客分享页）
   🔴 判据必须是【形状】而不是【长度】：用 `!tags.length` 的话，
      「她撤掉所有预设词、只留自填词」会走进反推分支，读一个从不落库的
      r.style_text（永远 undefined）→ 返回空 → 那颗自填词从分享页上消失。
      今天不炸纯属巧合（老数据里正好有 style_text 可读），不是设计。 */
function readPresets(r) {
  const src = Array.isArray(r.style_tags) ? r.style_tags : splitStyleText(r.style_text)
  return src.filter(function (w) { return ALL_TAGS.indexOf(w) >= 0 })
}

/* 勾选态 + 分组选项（编辑页那一屏的全部数据）。
   🔴 一次调用同时给出 picked（扁平并集）和 groups（每一组的勾选态 + 自填词）——
      旧版这里只有 groups，页面得自己再算一份 picked；两处算同一个东西，
      迟早有一处先烂掉，而且是静默烂。
   ⚠️ 自填词挂到它自己那一组；认不出的组名归 GROUP_FALLBACK。 */
function toStyleView(presets, custom) {
  const onPreset = {}
  ;(Array.isArray(presets) ? presets : []).forEach(function (w) {
    if (ALL_TAGS.indexOf(w) >= 0) onPreset[w] = true
  })
  const norm = normalizeCustom(custom)
  const groups = STYLE_GROUPS.map(function (g) {
    const mine = []
    eachCustom(norm, function (c) {
      if ((isValidGroup(c.group) ? c.group : GROUP_FALLBACK) === g.group) {
        mine.push({ name: c.name, on: c.on })
      }
    })
    return {
      group: g.group,
      items: (g.items || []).map(function (name) {
        return { name: name, on: !!onPreset[name] }
      }),
      custom: mine
    }
  })
  return { picked: allStyleWords(presets, norm), groups: groups }
}

/* 点一个预设词：不 mutate 入参，返回新数组。 */
function toggleTag(picked, name) {
  const list = Array.isArray(picked) ? picked.slice() : []
  const i = list.indexOf(name)
  if (i >= 0) list.splice(i, 1)
  else list.push(name)
  return list
}

/* 点一颗自填词的本体：只翻它自己的 `on`，不 mutate 入参。
   ⚠️ 点本体【不是删】—— 2026-09-30 用户临时改的口径：
      「点自己的词是勾选，点词旁边的叉叉是删除，系统设定的词不能删，
        妆娘自定义可以删」。删走 removeCustomTag。 */
function toggleCustomTag(custom, name) {
  const w = String(name == null ? '' : name).trim().toLowerCase()
  return normalizeCustom(custom).map(function (sec) {
    return {
      group: sec.group,
      items: sec.items.map(function (it) {
        return it.name.toLowerCase() === w ? { name: it.name, on: !it.on } : it
      })
    }
  })
}

/* ── 校验：一处实现，返回 {ok:true,...} 或 {ok:false,error} ────────────
   ⚠️ 页面【不预判】，只拿 store 的返回说话 —— 校验规则一份，
      失败话术也只有一处（照 templateStore 的先例：trim / 兜底只在 store 里判）。
   ⚠️ 昵称 / 城市 / 风格三条都【拦空】，理由不是洁癖：
      landing.wxml 上是 `{{artist.city}} · {{artist.style_text}}` 和一行大标题，
      空一个就是「· 建模感 / 浓系」这种断头文案，而那一页是【提审截图】。
      把「显示层要容错」换成「录入层不许错」，比在 4 个 wxml 里各写一个兜底便宜。
      ⚠️ 简介【允许空】—— 它就是选填的。 */
function validateNickname(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return { ok: false, error: TOAST.NICKNAME_EMPTY }
  if (s.length > NICKNAME_MAX) return { ok: false, error: TOAST.NICKNAME_LONG }
  return { ok: true, value: s }
}

function validateCity(v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return { ok: false, error: TOAST.CITY_EMPTY }
  if (s.length > CITY_MAX) return { ok: false, error: TOAST.CITY_LONG }
  return { ok: true, value: s }
}

function validateIntro(v) {
  // ⚠️ 前后空格 / 换行 trim 掉（首尾的空白没有意义，留着会让
  //    landing 上那句 `wx:if="{{artist.intro}}"` 对一个纯空白的简介成立，
  //    渲染出一行空白）。中间的换行是正文，一律保留。
  const s = String(v == null ? '' : v).trim()
  if (s.length > INTRO_MAX) {
    return { ok: false, error: TOAST.INTRO_LONG.replace('N', String(s.length)) }
  }
  return { ok: true, value: s }
}

/* 一颗自填词【本身】合不合法（不管它有没有跟别的重名）。
   ⚠️ 顺序有意：空 → 斜杠 → 长度 → 撞预设。先报哪一条，是她心里的顺序。
   ⚠️ 先 trim 再比（validateNickname 就是先 trim 的先例）：
      不 trim 的话「  展妆 」撞不上预设词「展妆」，一颗重复的词就这么混进来了。
   🔴「不能含 `/`」这一条是【静默损坏的唯一入口】：她打 `cos/古风`，
      storage 里看着是一个词、style_text 看着正常，但任何一次
      splitStyleText 反推都会把它劈成「cos」和「古风」两个词。 */
function validateCustomWord(word) {
  const w = String(word == null ? '' : word).trim()
  if (!w) return { ok: false, error: TOAST.STYLE_CUSTOM_EMPTY }
  if (w.indexOf('/') >= 0) return { ok: false, error: TOAST.STYLE_CUSTOM_SLASH }
  if (w.length > CUSTOM_MAX_LEN) {
    return {
      ok: false,
      /* 🔴 先填 N 再填 X，⛔ 不能反 —— 反过来的话，她打的词里只要有一个
         大写 N（比如「NANA妆」），第二个 replace 会把她词里那个 N 换成数字，
         播出来是「「5ANA妆」有 5 个字」。 */
      error: TOAST.STYLE_CUSTOM_LONG.replace('N', String(w.length)).replace('X', w)
    }
  }
  if (ALL_TAGS.indexOf(w) >= 0) {
    return { ok: false, error: TOAST.STYLE_CUSTOM_PRESET.replace('X', w) }
  }
  return { ok: true, value: w }
}

/* 加一颗新词时的完整闸 = 词本身 + 查重。
   ⚠️ 【名额】不在这里判，在 addCustomTag 里判 —— 见那边的注释。
   ⚠️ 查重跨组也算（「浓度」组里的 A 和「题材」组里的 A 是同一个词）。
      重名【按小写比】但存她打的那个写法（照 booking.js 的 pushHist 先例）。
   🔴 撞预设 和 撞自填 必须是【两句不同的话】：撞预设的出路是「直接点它」
      （词就在屏幕上），撞自填的出路是「去改那颗 ✕」。混成一句就把出路说丢了。 */
function validateCustomTag(word, custom) {
  const v = validateCustomWord(word)
  if (!v.ok) return v
  const k = v.value.toLowerCase()
  let dup = false
  eachCustom(custom, function (c) {
    if (String(c.name == null ? '' : c.name).trim().toLowerCase() === k) dup = true
  })
  if (dup) return { ok: false, error: TOAST.STYLE_CUSTOM_DUP.replace('X', v.value) }
  return { ok: true, value: v.value }
}

/* 加一颗自填词。返回 {ok:true, custom} 或 {ok:false, error}。
   ⚠️ 新词一律 `on: true`（她刚打完，就是要用它）。
   🔴 名额判在【这里】而不是 validateCustomWord 里：validateStyles 会拿
      validateCustomWord 去过一遍**已经躺在列表里的**词，把名额判塞进去的话，
      校验第 6 颗（合法的那颗）时它会数到自己、报「最多 6 个」——自己撞自己。 */
function addCustomTag(custom, group, word) {
  const v = validateCustomTag(word, custom)
  if (!v.ok) return { ok: false, error: v.error }
  if (customWords(custom).length >= CUSTOM_MAX) {
    return { ok: false, error: TOAST.STYLE_CUSTOM_MAX }
  }
  const norm = normalizeCustom(custom)
  const g = isValidGroup(group) ? group : GROUP_FALLBACK
  let hit = false
  const out = norm.map(function (sec) {
    if (sec.group !== g) return sec
    hit = true
    return { group: sec.group, items: sec.items.concat([{ name: v.value, on: true }]) }
  })
  if (!hit) out.push({ group: g, items: [{ name: v.value, on: true }] })
  return { ok: true, custom: out, value: v.value }
}

/* 删一颗自填词。
   ⚠️ 那一组空了就【整条去掉】，⛔ 不留空壳 `{group:'浓度', items:[]}`
      —— 空壳会在页面上渲染出一行只有标题、底下什么都没有的分组。
   ⚠️ 全项目的删除【不出声】：她按的就是写着 ✕ 的键，意图没有歧义
      （同 booking.js 清搜索历史不弹二次确认的先例）。⛔ 别拿规矩 22 来"修"它。 */
function removeCustomTag(custom, word) {
  const w = String(word == null ? '' : word).trim().toLowerCase()
  const out = []
  normalizeCustom(custom).forEach(function (sec) {
    const items = sec.items.filter(function (it) {
      return it.name.toLowerCase() !== w
    })
    if (items.length) out.push({ group: sec.group, items: items })
  })
  return out
}

/* 🔴 风格的【唯一】校验点（预设通道 + 自填通道一起判）。
   判据四条，顺序有意：
     ① 预设通道里出现词表外的词 → STYLE_INVALID（点名是哪个词）
        ⚠️ 这一条防的是【写坏了的数据 / 别的调用方】，不是防页面 ——
           页面根本传不进预设词表以外的东西（预设 chip 只有那 16 个）。
           和 saveArtist 的白名单同一性质，所以它得留着。
     ② 并集为空 → STYLE_NONE
        🔴 判据必须是【并集】：她撤掉所有预设词、只留一颗自填词时
           style_tags 是空的，但她明明选了一个 —— 只看 style_tags 就会误报
           「至少选一个接妆风格」，而她屏幕上那个词明明亮着。
     ③ 每一颗自填词过 validateCustomWord（⛔ 不在这里重写一遍规则）
        ⚠️ 传过的这份已经 normalize 过：重名在 normalizeCustom 里去掉了，
           所以这里只查「词本身」（空 / 斜杠 / 超长 / 撞预设）。
     ④ 自填词总数 ≤ CUSTOM_MAX —— 写入点也要判，⛔ 不能只在"添加"时判，
        否则那个上限只是 UI 建议（手改过的 storage 能绕过它存进来）。 */
function validateStyles(presets, custom) {
  const ps = Array.isArray(presets) ? presets : []
  const bad = ps.filter(function (w) { return ALL_TAGS.indexOf(w) < 0 })
  if (bad.length) {
    return { ok: false, error: TOAST.STYLE_INVALID.replace('X', bad[0]) }
  }
  const cs = normalizeCustom(custom)
  const words = customWords(cs)
  if (words.length > CUSTOM_MAX) {
    return { ok: false, error: TOAST.STYLE_CUSTOM_MAX }
  }
  let err = ''
  words.forEach(function (w) {
    if (err) return
    const v = validateCustomWord(w)
    if (!v.ok) err = v.error
  })
  if (err) return { ok: false, error: err }
  if (!allStyleWords(ps, cs).length) {
    return { ok: false, error: TOAST.STYLE_NONE }
  }
  return { ok: true, presets: ps.slice(), custom: cs }
}

/* ────────────────────────────────────────────────────────────────────
   wx 区
   ──────────────────────────────────────────────────────────────────── */

/* 播种用的那条记录。
   ⚠️ 形状是【存进 storage 的那 7 个键】，⛔ 不含 style_text
      （派生字段从不落库，见文件头 ②）。
   ⚠️ style_tags 优先用 mock 里那份；没有才拿 style_text 反推 ——
      反推只服务「不完整的数据」，见 splitStyleText 上面的注释。
   ⚠️ style_custom 是空的：demo 不给自填词（提审截图里别多出东西）。
   ⚠️ avatar_color 也过 avatarColorOf：mock 里那个令牌是哪天被改错的，
      播种出来的也仍然是个能画出来的颜色（⛔ 别信 mock 里写的东西）。 */
function seedRecord() {
  const p = ARTIST_PUBLIC || {}
  const tags = Array.isArray(p.style_tags) && p.style_tags.length
    ? p.style_tags.slice()
    : splitStyleText(p.style_text)
  return {
    artist_id: p.artist_id || 'demo',
    nickname: p.nickname || '',
    city: p.city || '',
    style_tags: tags,
    style_custom: Array.isArray(p.style_custom) ? JSON.parse(JSON.stringify(p.style_custom)) : [],
    intro: typeof p.intro === 'string' ? p.intro : '',
    avatar_color: avatarColorOf(p.avatar_color)
  }
}

/* 判据是「storage 里【没有这个 key】」，⛔ 不是「对象是空的」——
   跟 scheduleStore.seed() 同一条规矩：`{}` 在 JS 里是真值，
   所以 `!` 天然把「从没存过」和「存了一个空的」分开。
   ⚠️ 必须深拷贝：不拷的话，自测里那个按引用存的 storage 桩
      会让播种这一步直接把改动写进 mock/data.js 的常量，跨段污染。 */
function seed() {
  if (!wx.getStorageSync(KEY)) {
    wx.setStorageSync(KEY, JSON.parse(JSON.stringify(seedRecord())))
  }
}

/* ⛔ 只给「写回」用。展示一律走 getArtist()。 */
function raw() {
  seed()
  return wx.getStorageSync(KEY) || {}
}

/* 页面拿到的就是这个（读模型）。
   ⛔ 白名单：只出下面这 7 个键，其余一律不出去 —— 这一层是
      「资料页不许夹带微信号」在【代码层】的落点。
   ⚠️ 这里的 style_tags 是【并集】（预设 + 自填），和 style_text 同口径 ——
      于是 `style_text === buildStyleText(style_tags)` 是结构性成立的（规矩 16）。
   📌 style_custom【不出去】：「她自填了哪些词、挂在哪一组」是编辑页的事，
      展示方只认一句 style_text。编辑页走 getStyleState()。
   📌 2026-09-30（第十九处）：第 7 个键由 `initial`（昵称首字）换成
      `avatar_color`（颜色令牌）。**仍然是 7 个键，⛔ 没有第 8 个** ——
      `my-profile.js` 是整对象 setData，加键会撞上「资料页只上公开那几项」
      那几条断言（规矩 16）。
      🔴 换掉 initial 顺带消灭了一个真 bug：头像位原先渲染昵称的**第一个字**，
         而 `s.slice(0,1)` 会把 emoji（代理对）劈成半个字符，屏幕上出现
         「一个菱形里面一个问号」（用户真机上拍的）。现在头像位画的是一张
         【和昵称无关的人像】，这类输入问题从根上没有了。 */
function getArtist() {
  const r = raw()
  const words = allStyleWords(readPresets(r), normalizeCustom(r.style_custom))
  return {
    artist_id: r.artist_id || 'demo',
    nickname: r.nickname || '',
    city: r.city || '',
    style_tags: words,
    style_text: buildStyleText(words),
    intro: typeof r.intro === 'string' ? r.intro : '',
    avatar_color: avatarColorOf(r.avatar_color)
  }
}

/* 编辑页（pages/style-edit/）专用的读模型。
   ⚠️ 和 getArtist() 【分开】是有意的：展示方不需要知道"哪颗词挂在哪一组、
      哪颗没选用"，而编辑页需要。硬塞进 getArtist() 会让那个对象长出第 8 个键，
      撞上「资料页只上公开那几项」的断言（规矩 16：读模型的形状是被钉住的）。
   ⚠️ 两个字段都过消毒：预设 ∩ 词表，自填过 normalizeCustom
      （trim / 去重 / 组名兜底）。 */
function getStyleState() {
  const r = raw()
  return {
    presets: readPresets(r),
    custom: normalizeCustom(r.style_custom)
  }
}

/* 唯一写入口，也是唯一校验点（规矩 11）。
   ⚠️ 任何一条校验不过 → 直接返回，`setStorageSync` 一次都不调。
      这是自测里「超 200 字被拦住且没有发生任何写操作」那条断言的落点。
   ⚠️ 白名单：只认 nickname / city / intro / style_tags / style_custom /
      avatar_color 六个键。
      patch 里带 artist_id / wechat_id / 别的任何东西 → 一律丢弃
      （不是报错，是不落库）。
   🔴🔴 `next` 是【逐字段重建】的，所以每加一个字段就必须在这儿显式接住它。
      漏接一个的后果不是"报错"，是**静默抹掉**：比如上一版有人给
      pages/my-profile 加了 saveArtist({nickname})，而 next 里没接
      style_custom —— 改一次昵称＝她的自填词全没了，屏幕上还弹「已保存」。
      ⇒ 风格那两个字段 + avatar_color 一律无条件从 cur 接住
        （自测里每种抹掉各有一条钉着）。 */
function saveArtist(patch) {
  const cur = raw()
  const next = {
    artist_id: cur.artist_id || 'demo',
    nickname: cur.nickname || '',
    city: cur.city || '',
    style_tags: readPresets(cur),
    style_custom: normalizeCustom(cur.style_custom),
    intro: typeof cur.intro === 'string' ? cur.intro : '',
    avatar_color: avatarColorOf(cur.avatar_color)
  }
  const p = patch || {}
  let v

  if ('nickname' in p) {
    v = validateNickname(p.nickname); if (!v.ok) return { ok: false, error: v.error }
    next.nickname = v.value
  }
  if ('city' in p) {
    v = validateCity(p.city); if (!v.ok) return { ok: false, error: v.error }
    next.city = v.value
  }
  if ('intro' in p) {
    v = validateIntro(p.intro); if (!v.ok) return { ok: false, error: v.error }
    next.intro = v.value
  }
  /* 风格两个通道一起校验（唯一校验点）。
     ⚠️ 只有 patch 里碰了风格才校验 —— 别的字段的保存不该被"她还没选风格"
        拦住（那份记录本来就该至少有一个词，校验的是她正要写进去的下一版）。
     🔴 传进去的是【合并后】的两份：没碰的那个通道取 cur 里那份。
        这正是不看 `p.style_tags` 而看 next 的原因 —— 「撤掉所有预设词、
        只留自填词」时 next.style_tags 是空的，但并集不是空的，不许误拦。 */
  if (('style_tags' in p) || ('style_custom' in p)) {
    v = validateStyles(
      ('style_tags' in p) ? p.style_tags : next.style_tags,
      ('style_custom' in p) ? p.style_custom : next.style_custom
    )
    if (!v.ok) return { ok: false, error: v.error }
    next.style_tags = v.presets
    next.style_custom = v.custom
  }
  /* 头像颜色：⛔ 这里没有 error 分支，而且**这不是漏了** ——
     avatarColorOf 是个【全函数】（任何输入都映射到一个能画出来的令牌），
     所以「校验失败」这个状态不存在，也就没有需要出声的分支（规矩 22 管的是
     "有失败路径却不说话"，不是"不许有无分支的赋值"）。
     她挑的颜色一定在闭集里（调色板就 6 颗）；会走到回落分支的只有
     手改过的 storage / M1 里别人写坏的数据，那时回落到默认色正是我们要的。 */
  if ('avatar_color' in p) next.avatar_color = avatarColorOf(p.avatar_color)

  try {
    wx.setStorageSync(KEY, next)
  } catch (e) {
    // 配额满 / 平台异常 —— ⛔ 不许假装成功（TOAST.SAVE_FAILED 的注释里写了为什么）
    return { ok: false, error: TOAST.SAVE_FAILED }
  }
  return { ok: true, artist: getArtist() }
}

module.exports = {
  KEY, NICKNAME_MAX, CITY_MAX, INTRO_MAX, CUSTOM_MAX, CUSTOM_MAX_LEN,
  GROUP_FALLBACK, STYLE_SEP, ALL_TAGS, AVATAR_COLORS, AVATAR_COLOR_DEFAULT,
  splitStyleText, buildStyleText, avatarColorOf, allStyleWords, toStyleView, toggleTag,
  eachCustom, isValidGroup, normalizeCustom, customWords,
  toggleCustomTag, validateCustomWord, validateCustomTag, addCustomTag, removeCustomTag,
  validateNickname, validateCity, validateIntro, validateStyles,
  getArtist, getStyleState, saveArtist, raw
}
