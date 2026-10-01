/**
 * 「我约过的妆娘」这一层（2026-09-30 第二十处新增，2026-10-01 第二十一处收窄）。
 *
 * 🔴 这个列表是【一份私人记录】，⛔ 不是「平台上有哪些妆娘」：
 *    它的长度 = 你自己约过几个人，判据 = 你自己提交过的那张预约单
 *    （`created_by === 'user'`）。这在个人主体下不是取舍，是**唯一合规的形态** ——
 *    一个「可枚举的公开妆娘列表」正是红线 1（一个能被人一页页翻完的人肉目录），
 *    而个人主体没有社交/社区类目，公域发现那条路在第十九处就已经整块砍掉了。
 *    ⇒ 从这里取数据的那一页（约妆端 tab 1）必须是这个口径；
 *      **演示数据也必须自洽**：列表里有她，就一定有一条「我约过她」的单，
 *      ⛔ 不许出现一个没约过的人（自测里有一条断言专门钉这件事）。
 *    ⛔ 谁要是想把这里改成「读 ARTIST_DIRECTORY」，那是在把这份记录做成目录 ——
 *    先去看 README §3.7，别改。
 *
 * ⚠️ 为什么单独一个 util 而不是写在页面里：这一页的行是**聚合成一位一位**的
 *    （同一位妆娘的好几张单要并成一行、还要排「最近那一位在最前」），
 *    这种聚合只该有一份实现（规矩 11）。写在页面里的话，下一个人想复用
 *    「我约过谁」这四个字就得再算一遍，两处一旦口径不同就是
 *    「这一页说约过 3 位、别的页面说 4 位」，而两边都不报错。
 *
 * 📌 2026-10-01（第二十一处）：原先是【两处共用】—— 除了列表页，还有约妆首页
 *    （`pages/guest-home/`）那张「共约过 N 位妆娘」的聚合卡。用户当场要求
 *    「用户端预约过的妆娘是一个页面，我的是一个页面，不要放在同一个页面里面」，
 *    于是约妆端改成了两个 tab，首页整页退役，那张卡**连同 `myArtistsBrief()`
 *    一起删掉**了 —— 它说的那两句话（共约过几位 / 最近约的是谁）现在由
 *    列表自己一行行说全，⛔ 不是"暂时没人用先留着"（这个项目不留死代码）。
 *    ⚠️ 所以：**别把 myArtistsBrief 加回来**。真要在别处再显示"共约过几位"，
 *       那就说明又出现了第二个"概览"页面，先问清楚是不是要再把首页做回来。
 */
const { getBookings, statusText } = require('./bookingStore')
const { getArtistById } = require('./artistStore')

/* 这一页叫什么 —— 列表页的导航栏标题**和约妆端底部那条第一格的字**都用它。
   两处各写一遍（「我的妆娘」/「我约过的妆娘」）的代价是：
   顾客点开发现标题换了个说法，怀疑是不是同一个地方。
   一个字符串也值得抽出来，因为它要的就是「一处实现」（规矩 25）。
   ⚠️ 底部那条那份在 utils/tabbar.js 的 TABS.guest[0].text —— 那是**字符串**
      不是这个常量（app.json 的 tabBar.list 也写着同一句，微信要求那里是字面量）。
      三处必须逐字一样，自测里有一条把 tabbar.js 和 app.json 两份并起来比。 */
const TITLE = '我约过的妆娘'

/* 一位都没有的时候说这两句（真的一位都没约过那一支）。
   ⚠️ 「搜了个词、一个都没对上」是**另一支**、说的也不是这两句 ——
      那一支在 artist-list.wxml 里写着（「换个词，或点右上角收起」）：
      对她说「还没有约过妆娘」是答非所问，她明明约过。
   🔴 而且这两句【只说实话】：⛔ 不许写「去看看有哪些妆娘」之类的发现式引导 ——
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
       my-profile 那三处**逐字一样**。
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
  myBookings, lastText, listMyArtists, matchArtist
}
