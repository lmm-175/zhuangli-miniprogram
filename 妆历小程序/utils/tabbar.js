/**
 * 底部导航条的清单 + 「让当前这一页把选中格点亮」那一下。
 * （2026-10-01 第二十一处新增）
 *
 * 🔴 为什么要有这一层：小程序**全局只有一个 tabBar**（`app.json` 里就一处），
 *    而妆历有两个角色，底部条长得不一样 ——
 *      妆师端 3 格：档期 / 预约单 / 我的
 *      约妆端 3 格：我约过的妆娘 / 我的预约 / 我的
 *    原生 tabBar 表达不了「按角色换一排」，只能 `"custom": true`
 *    + `custom-tab-bar/` 自己画（详细理由在那个组件里）。
 *
 * 📌 2026-10-01 同日第二轮：约妆端从 2 格加到 3 格（用户原话「底栏变成三个，
 *    把我的预约也放进去」），「我的预约」由「我的」页的下一层**升成 tab 页**。
 *    ⚠️ 升格的连带：`pages/guest-bookings/` 从此**没有返回箭头**（tab 页没有
 *    「上一页」），而且「我的」页那一行**必须删掉** —— 否则同一个落点两个入口
 *    （规矩 11 / 第十九处那条「删的是重复入口」）。
 *
 * ⚠️ 这份清单和 `app.json` 的 `tabBar.list` 是**同一件事的两半**，
 *    而且两半都必须留着：app.json 那份是微信认的（`wx.switchTab` 只认它），
 *    这份是画的时候读的。自测里有一条把两半并起来比序 ——
 *    只改一边的话，现象是「点得动的那一格和画出来的那一格不是同一个」。
 */
const TABS = {
  artist: [
    { path: '/pages/schedule/schedule', text: '档期' },
    { path: '/pages/booking/booking', text: '预约单' },
    { path: '/pages/mine/mine', text: '我的' }
  ],
  guest: [
    { path: '/pages/artist-list/artist-list', text: '我约过的妆娘' },
    { path: '/pages/guest-bookings/guest-bookings', text: '我的预约' },
    { path: '/pages/guest-mine/guest-mine', text: '我的' }
  ]
}

/* 角色 → 那一排。
   ⚠️ 认不出来的角色（`''`、未选身份、拼错的字符串）一律按**约妆端**画：
      三格，其中没有一个是妆娘的动作。⛔ 绝不是「认不出来就画妆师端」——
      那会让一个刚进来的人看见妆娘端的入口（档期 / 预约单），
      而妆师端那几个页面是**她的私人班表**。这个兜底方向是安全的那一边。 */
function tabsOf(role) {
  return role === 'artist' ? TABS.artist : TABS.guest
}

/**
 * 当前这一页把底部那条的选中格点亮。每个 tab 页的 `onShow` 第一行调一次。
 *
 * ⚠️ 两条兜底都是**故意的静默**，但理由不同（README 第 34 条：没有失败分支的
 *    路径必须说清楚为什么不出声）：
 *   ① 页面没有 `getTabBar` —— 那是**原生 tabBar** 的情形（app.json 里
 *      `custom` 被关掉了，或者基础库太老）。原生自己会点亮，
 *      **没有任何东西要修**，所以不出声是对的。
 *   ② `getTabBar()` 返回空 —— 这一页不是 tab 页，或者自定义组件还没挂上。
 *      同理，不需要修。
 *    两条都不是「失败被吞掉」；真出问题时肉眼看得见的现象是
 *    「选中格没点亮」，⛔ 不是「一片安静」。
 */
function syncTabBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (bar && typeof bar.sync === 'function') bar.sync()
}

module.exports = { TABS, tabsOf, syncTabBar }
