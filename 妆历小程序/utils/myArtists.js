/**
 * 「我约过的妆娘」—— 顾客端【两处共用】的一份聚合（2026-09-30 第二十处新增）。
 *
 * 🔴 这个列表是【一份私人记录】，⛔ 不是「平台上有哪些妆娘」：
 *    它的长度 = 你自己约过几个人，判据 = 你自己提交过的那张预约单
 *    （`created_by === 'user'`）。这在个人主体下不是取舍，是**唯一合规的形态** ——
 *    一个「可枚举的公开妆娘列表」正是红线 1（一个能被人一页页翻完的人肉目录），
 *    而个人主体没有社交/社区类目，公域发现那条路在第十九处就已经整块砍掉了。
 *    ⇒ 从这里取数据的那两页（列表页 / 约妆首页那张卡）都必须是这个口径；
 *      **演示数据也必须自洽**：列表里有她，就一定有一条「我约过她」的单，
 *      ⛔ 不许出现一个没约过的人（自测里有一条断言专门钉这件事）。
 *    ⛔ 谁要是想把这里改成「读 ARTIST_DIRECTORY」，那是在把这份记录做成目录 ——
 *    先去看 README §3.7，别改。
 *
 * ⚠️ 为什么单独一个 util 而不是写在页面里：约妆首页那张卡要说的
 *    「共约过几位 + 最近约的是谁」和列表页每一行的「最近约妆」
 *    必须是**同一个函数算出来的**（规矩 11）。首页写一份、列表页写一份的下场是
 *    「首页说 3 位、点进去列表 4 行」，而两处都不报错。
 */
const { getBookings, statusText } = require('./bookingStore')
const { getArtistById } = require('./artistStore')

/* 这一页叫什么。🔴 列表页的导航栏标题和约妆首页那条小节标题【都用它】——
   两处各写一遍（「我的妆娘」/「我约过的妆娘」）的代价是：
   顾客点进去发现标题换了个说法，怀疑是不是同一个地方。
   一个字符串也值得抽出来，因为它要的就是「一处实现」（规矩 25）。 */
const TITLE = '我约过的妆娘'

/* 一位都没有的时候说这两句。⚠️ 同样两页共用：列表页的主空态和首页卡片上的空态
   是同一件事，说法必须一样。
   🔴 而且它【只说实话】：⛔ 不许写「去看看有哪些妆娘」之类的发现式引导 ——
   这一页是私人记录，「去看看有哪些」等于自己承认有个目录（README §3.7）。 */
const EMPTY = '还没有约过妆娘'
const EMPTY_SUB = '从妆位页选一个妆位填单后，这里会记下来'

/* 顾客自己的单。
   ⛔ 不能拿 getBookings() 整个数组 —— 里面有 created_by: 'artist' 的单，
   那是妆娘【替别人代填】的（第十七处「代填」），不是「我约过的」。 */
function myBookings() {
  return getBookings().filter((b) => b && b.created_by === 'user')
}

/* 一位妆娘那一行要说的话：「最近约妆：青蓝漫展 · 2026-10-03 · 已确认」。
   ⚠️ 三个字段可能各自缺（老单没有 event、状态未知）—— 缺的那个**直接不占位**，
      ⛔ 不许落一个 undefined 在页面上：渲染出「undefined · 2026-10-03」的行，
      顾客会以为是自己哪一步填错了。 */
function lastText(b) {
  if (!b) return ''
  return [b.event, b.date, statusText(b.status)].filter(Boolean).join(' · ')
}

/* 一行 = 一位妆娘 + 我约过她几次 + 最近的那一次。
   ⚠️ 「最近」按 `created_at`（下单时间）算，⛔ 不是按漫展日期 ——
      这一页记的是「我约过谁」，「谁排在前面见」是另一件事。 */
function rowOf(g) {
  const a = getArtistById(g.artist_id)
  return {
    // wx:key 用它，navigateTo 也用它
    id: g.artist_id,
    /* ⚠️ 字段名叫 `avatar_color`（⛔ 不叫 `color`），而且这一行【故意摊平】，
       因为列表页要写成 `c-{{artist.avatar_color}}` —— 和 landing / mine /
       my-profile / guest-home 那四处**逐字一样**。
       好处有两层：① 令牌 → 颜色的映射仍然只有 `.c-*` 那一份；
       ② 自测里那条「全项目每一处头像都带颜色令牌」的断言不用为这一页改判据
       （它按 `artist.avatar_color` 这个写法认人）。
       ⛔ 别为了少两个字母把它改名成 `color`：那会让那条断言要么漏掉这一页、
          要么被迫放宽成两个写法 —— 两条路都比多打 7 个字符贵。 */
    avatar_color: a.avatar_color,
    nickname: a.nickname,
    city: a.city,
    count: g.count,
    lastText: lastText(g.last)
  }
}

/* 最近约过的排最前。
   ⚠️ 并列时按 artist_id 定死次序 —— ⛔ 不靠 Array#sort 的稳定性表达这件事，
      那读起来像巧合，换引擎或换个插入次序就说不准了。 */
function byRecent(x, y) {
  const a = x.last ? String(x.last.created_at || '') : ''
  const b = y.last ? String(y.last.created_at || '') : ''
  if (a !== b) return a < b ? 1 : -1
  return x.id < y.id ? -1 : 1
}

function listMyArtists() {
  const groups = []
  const byId = {}
  myBookings().forEach((b) => {
    // ⚠️ `b.artist_id || 'demo'` 的兜底和 bookingStore.bookingsOfArtist 同一条理由：
    //    老单没有这个字段，直接比会让「我约过的妆娘」凭空少一位（而不是报错）。
    const id = b.artist_id || 'demo'
    if (!byId[id]) {
      byId[id] = { artist_id: id, count: 0, last: null }
      groups.push(byId[id])
    }
    const g = byId[id]
    g.count++
    // 同一秒下的两单没有先后可言，谁先到谁算「最近」即可
    if (!g.last || String(b.created_at || '') > String(g.last.created_at || '')) g.last = b
  })
  return groups.map(rowOf).sort(byRecent)
}

/* 约妆首页那张卡要的两句话：共约过几位 + 最近约的是谁/哪一场。
   ⚠️ 它和 listMyArtists() 的第 0 行是**同一份数据**（同一个 sort）——
      首页说「最近约的是小满」，点进去列表第一行必须也是小满。
      所以这里⛔ 不许另算一遍（比如再扫一次 BOOKINGS 找 created_at 最大的那张单），
      那样两处一旦口径不同，首页说的和列表里看到的就不是同一个人。 */
function myArtistsBrief() {
  const rows = listMyArtists()
  if (!rows.length) return { count: 0, head: EMPTY, sub: EMPTY_SUB }
  const first = rows[0]
  return {
    count: rows.length,
    head: '共约过 ' + rows.length + ' 位妆娘',
    sub: '最近约的是 ' + first.nickname + ' · ' + first.lastText
  }
}

/* 一位妆娘匹配不匹配一个词。
   🔴 只认【昵称】和【城市】—— ⛔ 不搜风格词。
      搜索的语义是「我记得她叫什么 / 她在哪个城市」；风格是**筛人的另一种方式**，
      而「按风格筛人」那个功能是被明确砍掉的（第十九处：搜索那条豁免只覆盖
      妆娘端自己的单，⛔ 不等于这里可以按风格筛人）。
      两件事混进一个框里，顾客打一个「古风」会得到一份她解释不了的名单。
      ⚠️ 边界写在页面的 placeholder 上（「搜妆娘昵称 / 城市」），
        文案和这里必须同口径（规矩 25）。
   ⚠️ 大小写不敏感、前后空格去掉 —— 跟妆师端 matchesKeyword 同一套规矩。 */
function matchArtist(row, kw) {
  const q = String(kw == null ? '' : kw).trim().toLowerCase()
  if (!q) return true
  return String(row.nickname || '').toLowerCase().indexOf(q) >= 0 ||
         String(row.city || '').toLowerCase().indexOf(q) >= 0
}

module.exports = {
  TITLE, EMPTY, EMPTY_SUB,
  myBookings, lastText, listMyArtists, myArtistsBrief, matchArtist
}
