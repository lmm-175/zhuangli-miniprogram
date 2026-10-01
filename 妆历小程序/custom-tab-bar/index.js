/**
 * 自定义 tabBar —— 全项目【唯一】那条底部导航条（2026-10-01 第二十一处）。
 *
 * 🔴 为什么非要有这个东西：小程序**全局只有一个 tabBar**（`app.json` 里那一处），
 *    而妆历两个角色的底部条不一样（妆师端 3 格 / 约妆端 2 格）。
 *    原生 tabBar 给不出「按角色换一排」，唯一的做法是 `"custom": true`
 *    + 这个组件，由它自己决定画哪一排。
 *    ⛔ 另一条路是「约妆端自己在页面里画一条假的底栏」—— 不走那条：
 *       假底栏在 `wx.switchTab` 眼里根本不存在，页面栈也得自己用 redirectTo 维护，
 *       正是这个项目栽过好几次的「**看着像个控件、其实不是**」那个形状
 *       （README 第 21/22 条、Request N/O）。
 *
 * ⚠️ 代价（微信的规矩，⛔ 不是我们能选的）：
 *    官方的自定义 tabBar **不会**替页面扣底部高度 —— 用原生的时候页面可视区
 *    自动少一截，换成自定义之后页面会【伸到这条条子底下】。
 *    所以每个 tab 页的根容器都带 `tabbed` 类（app.wxss 里 `.app.tabbed`
 *    补底部内边距），高度只有一处：`page` 上的 `--tabh`。
 *    ⇒ **新加一个 tab 页要同时做两件事**：注册进 app.json 的 tabBar.list、
 *      给它的根容器加 `.tabbed`。只做一件的现象是「页面最后一行被盖住」，
 *      而屏幕上一个字都不会报。
 *
 * ⚠️ 谁在什么时候调 `sync()`：统一由 `utils/tabbar.js` 的 `syncTabBar(page)`
 *    转发，每个 tab 页的 `onShow` 第一行调它 —— 这里⛔ 不自己读路由以外的状态。
 */
const { tabsOf } = require('../utils/tabbar')

Component({
  data: {
    items: [],
    selected: 0
  },

  methods: {
    /* 由每个 tab 页的 onShow 调（经 utils/tabbar.syncTabBar）。
       ⚠️ 角色和选中格都**现算**，⛔ 一个都不缓存：
          角色会变（妆师端 / 约妆端「我的」页里那条「切换身份」），
          缓存住的话切完身份底部还是旧那一排。 */
    sync() {
      let role = ''
      try { role = getApp().getRole() } catch (e) {}
      const items = tabsOf(role)

      /* 当前这一页是哪一格 —— **拿路由去认**，⛔ 不让页面报序号。
         序号会随着「加一格 / 换一排」而错位，而错位的表现是
         「底部点亮的是隔壁那一格」——看着像小毛病，实际是导航在撒谎。 */
      let selected = -1
      try {
        const stack = getCurrentPages()
        const cur = stack.length ? '/' + stack[stack.length - 1].route : ''
        items.forEach((t, i) => { if (t.path === cur) selected = i })
      } catch (e) {}

      /* ⚠️ 路由一个都对不上时【不猜一个】：保持上一次点亮的那一格。
          对不上的情形只有一种 —— 这一页不在当前角色的清单里（角色刚切、
          页面还没换过去）。那时画哪一格都是假的，不如不动。 */
      this.setData({ items, selected: selected < 0 ? this.data.selected : selected })
    },

    /* 点一格 → 换页。
       ⚠️ 点的是**当前这一格**时什么都不做 —— 原生 tabBar 也是这样。
          ⛔ 别写成「无脑 switchTab 自己」：那会把这一页的滚动位置和
          页面栈状态清一遍，用户看到的是「点了一下，页面闪了一下」。 */
    onTap(e) {
      const path = e.currentTarget.dataset.path
      const cur = this.data.items[this.data.selected]
      if (cur && cur.path === path) return
      wx.switchTab({ url: path })
    }
  }
})
