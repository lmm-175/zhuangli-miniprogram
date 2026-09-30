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
 * ② style_text 和 initial 是【派生字段】—— 只在这里算，⛔ 从不落 storage。
 *    style_text 派生自 style_tags，于是 landing / guest-home / mine /
 *    my-profile 四个 wxml 的 `{{artist.style_text}}` 一个字都不用改，
 *    接妆风格一改它们全都跟着变。只有一份真相：style_tags。
 *    ⚠️ 反面同样要守住：⛔ 别把派生值写回 storage —— 那就成了第二份真相，
 *       迟早跟 style_tags 对不上，而且是【静默】对不上。
 * ══════════════════════════════════════════════════════════════════════
 */
const KEY = 'zhuangli_artist'
const { ARTIST_PUBLIC, STYLE_GROUPS } = require('../mock/data')
const { TOAST } = require('./toast')

const NICKNAME_MAX = 12
const CITY_MAX = 12
const INTRO_MAX = 200

/* ⚠️ 必须跟 mock/data.js 里 ARTIST_PUBLIC.style_text 的分隔符【逐字一致】
   （空格 斜杠 空格）。差一个空格，往返断言当场红。 */
const STYLE_SEP = ' / '
const INITIAL_FALLBACK = '妆'

/* ══ 固定词表摊平（决策：接妆风格只用固定词表多选，⛔ 不开放自定义词）═══
   ⚠️ 来源是 mock/data.js 的 STYLE_GROUPS —— 那个文件自己写着「全站唯一来源」，
      ⛔ 不许在别处再抄一份 16 项的列表。
   这一份只做三件事：排序、校验、勾选态。 */
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
      没有 style_tags 的那种）。⛔ 别拿它当正常读路径 —— 正常读路径读 style_tags。 */
function splitStyleText(text) {
  return String(text == null ? '' : text)
    .split('/')
    .map(function (s) { return s.trim() })
    .filter(function (s) { return !!s })
}

/* 正向：标签数组 → 一句话。
   ⚠️ 按【词表顺序】排，⛔ 不是点击顺序 —— 同一组标签换个点击次序就换一段文案的话，
      分享页上的字会莫名其妙地变，而她什么都没改。
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
  const rank = function (w) {
    const i = ALL_TAGS.indexOf(w)
    return i < 0 ? ALL_TAGS.length : i   // 词表外的（不该有）沉到最后
  }
  uniq.sort(function (a, b) { return rank(a) - rank(b) })
  return uniq.join(STYLE_SEP)
}

/* 头像位那个字。空昵称兜底成「妆」，⛔ 不要留空 —— 空头像位看着像页面坏了。 */
function initialOf(nickname) {
  const s = String(nickname == null ? '' : nickname).trim()
  return s ? s.slice(0, 1) : INITIAL_FALLBACK
}

/* 勾选态 → 分组选项。⛔ 这是唯一一处把「已存标签」映射成勾选的地方，
      页面不许再自己 map 一遍（两遍就会有一遍先烂掉）。 */
function toStyleOptions(picked) {
  const on = {}
  ;(Array.isArray(picked) ? picked : []).forEach(function (w) { on[w] = true })
  return STYLE_GROUPS.map(function (g) {
    return {
      group: g.group,
      items: (g.items || []).map(function (name) {
        return { name: name, on: !!on[name] }
      })
    }
  })
}

/* 点一个词：不 mutate 入参，返回新数组。 */
function toggleTag(picked, name) {
  const list = Array.isArray(picked) ? picked.slice() : []
  const i = list.indexOf(name)
  if (i >= 0) list.splice(i, 1)
  else list.push(name)
  return list
}

/* ── 校验：一处实现，返回 {ok:true,value} 或 {ok:false,error} ──────────
   ⚠️ 页面【不预判】，只拿 saveArtist 的返回说话 —— 校验规则一份，
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

function validateStyleTags(arr) {
  const list = Array.isArray(arr) ? arr : []
  if (!list.length) {
    return { ok: false, error: TOAST.STYLE_NONE }
  }
  const bad = list.filter(function (w) { return ALL_TAGS.indexOf(w) < 0 })
  if (bad.length) {
    return { ok: false, error: TOAST.STYLE_INVALID.replace('X', bad[0]) }
  }
  return { ok: true, value: list.slice() }
}

/* ────────────────────────────────────────────────────────────────────
   wx 区
   ──────────────────────────────────────────────────────────────────── */

/* 播种用的那条记录。
   ⚠️ 形状是【存进 storage 的那 5 个键】，⛔ 不含 style_text / initial
      （派生字段从不落库，见文件头 ②）。
   ⚠️ style_tags 优先用 mock 里那份；没有才拿 style_text 反推 ——
      反推只服务「不完整的数据」，见 splitStyleText 上面的注释。 */
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
    intro: typeof p.intro === 'string' ? p.intro : ''
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
      「资料页不许夹带微信号」在【代码层】的落点。 */
function getArtist() {
  const r = raw()
  let tags = Array.isArray(r.style_tags)
    ? r.style_tags.filter(function (w) { return ALL_TAGS.indexOf(w) >= 0 })
    : []
  // 兜底：老 storage 只存了 style_text、没有 style_tags —— 反推回来，
  // ⛔ 不然分享页上接妆风格那一格会是空的。
  if (!tags.length) tags = splitStyleText(r.style_text).filter(function (w) {
    return ALL_TAGS.indexOf(w) >= 0
  })
  return {
    artist_id: r.artist_id || 'demo',
    nickname: r.nickname || '',
    city: r.city || '',
    style_tags: tags,
    style_text: buildStyleText(tags),
    intro: typeof r.intro === 'string' ? r.intro : '',
    initial: initialOf(r.nickname)
  }
}

/* 唯一写入口，也是唯一校验点（规矩 11）。
   ⚠️ 任何一条校验不过 → 直接返回，`setStorageSync` 一次都不调。
      这是自测里「超 200 字被拦住且没有发生任何写操作」那条断言的落点。
   ⚠️ 白名单：只认 nickname / city / intro / style_tags 四个键。
      patch 里带 artist_id / wechat_id / 别的任何东西 → 一律丢弃
      （不是报错，是不落库）。 */
function saveArtist(patch) {
  const cur = raw()
  const next = {
    artist_id: cur.artist_id || 'demo',
    nickname: cur.nickname || '',
    city: cur.city || '',
    style_tags: Array.isArray(cur.style_tags) && cur.style_tags.length
      ? cur.style_tags.slice()
      : splitStyleText(cur.style_text),
    intro: typeof cur.intro === 'string' ? cur.intro : ''
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
  if ('style_tags' in p) {
    v = validateStyleTags(p.style_tags); if (!v.ok) return { ok: false, error: v.error }
    next.style_tags = v.value
  }

  try {
    wx.setStorageSync(KEY, next)
  } catch (e) {
    // 配额满 / 平台异常 —— ⛔ 不许假装成功（TOAST.SAVE_FAILED 的注释里写了为什么）
    return { ok: false, error: TOAST.SAVE_FAILED }
  }
  return { ok: true, artist: getArtist() }
}

module.exports = {
  KEY, NICKNAME_MAX, CITY_MAX, INTRO_MAX, STYLE_SEP, ALL_TAGS,
  splitStyleText, buildStyleText, initialOf, toStyleOptions, toggleTag,
  validateNickname, validateCity, validateIntro, validateStyleTags,
  getArtist, saveArtist, raw
}
