/**
 * 自定义导航栏。
 *
 * 为什么不用系统导航栏（app.json 里 navigationStyle 没写 default）：
 *   界面稿的 A1「设置」/ 壳1「新建」/ 壳5「保存」/ C1「我的预约」都在导航栏右侧 ——
 *   微信系统导航栏只能放标题 + 系统返回箭头，放不下右侧文字动作。
 *
 * 自己画要补齐系统替你做掉的两件事：
 *   ① 状态栏高度（statusBarHeight）—— 各机型不同，必须运行时取；
 *   ② 右上角胶囊按钮（··· 和 ●）的占位 —— 那是微信的，谁也拿不走，
 *      我们自己的右侧动作必须止步在它左边，否则会被压住。
 *
 * ⚠️ 这两个数在 utils/navbar.js 里算，这里只是取来用 ——
 *    可拖动的浮层也要靠它避开导航栏，两边各算一遍迟早算歪。
 *
 * 动作放哪边，由页面选：
 *   放右边（默认，slot="right"）—— 标题居中于「让开胶囊之后的可用区」。
 *   放左边（slot="left" + center="screen"）—— 动作全在左上角，离胶囊最远，
 *     不会被误当成微信的按键点到。这时标题改居中于【整屏】。
 */
const { getNavMetrics } = require('../../utils/navbar')

Component({
  options: {
    multipleSlots: true,   // left / right 两个具名插槽
    addGlobalClass: true   // 允许页面用 .nv-act / .nv-hover 这类全局类
  },

  properties: {
    title: { type: String, value: '' },
    // 是否显示内置的「‹ 返回」。tabBar 页和用 slot="left" 自定的页面传 false。
    back: { type: Boolean, value: false },
    // 标题的居中基准：
    //   'usable'（默认）标题居中于「可用区」（＝ 让开胶囊之后那一段）。
    //                    右侧有动作时这是唯一稳的排法，见 nav.wxss 那段算式。
    //   'screen'        标题居中于【整屏】，会脱离文档流。
    //                    动作放左上角的页面（档期 / 预约单）用这个 —— 右边只剩
    //                    胶囊，标题就该对齐整屏中心，而不是被空着的右段顶偏。
    center: { type: String, value: 'usable' }
  },

  data: {
    statusH: 20,      // px，不能用 rpx —— 这是设备物理量，不跟屏宽缩放
    navH: 44,         // px
    capsulePad: 96,   // px，右侧动作要避开的宽度（胶囊宽 + 边距）
    cs: false,        // center === 'screen'（给 wxml 用的布尔）
    titleMax: 320     // px，'screen' 模式下标题的 max-width 兜底
  },

  lifetimes: {
    attached() {
      // 几何全在 utils/navbar.js 里算 —— 页面（可拖动的浮层要避开导航栏）也用同一份
      const nm = getNavMetrics()

      // center="screen" 时标题绝对居中于整屏，得有根「别钻到胶囊底下」的缰绳：
      // max-width = 屏宽 - 两侧各一份避让宽 → 标题撑到顶时右缘正好离胶囊 8px。
      // 左边那组动作比避让宽窄（73px < 102px），所以同一根缰绳也把它挡住了。
      const cs = this.data.center === 'screen'
      const titleMax = Math.max(0, nm.winW - nm.capsulePad * 2)

      this.setData({
        statusH: nm.statusH, navH: nm.navH, capsulePad: nm.capsulePad, cs, titleMax
      })
    }
  },

  methods: {
    onBack() {
      wx.navigateBack({
        delta: 1,
        fail() {
          // 页面栈里只有这一页（典型场景：从分享卡片直接进来的 C1）。
          // 不能什么都不做 —— 「点了没反应」正是 M0 要消灭的东西。
          // 按角色回落：约妆 → 约妆首页；妆师 / 未知 → 档期（tabBar 第 1 位）。
          let role = ''
          try { role = getApp().getRole() } catch (e) {}
          if (role === 'guest') {
            wx.redirectTo({ url: '/pages/guest-home/guest-home' })
          } else {
            wx.switchTab({ url: '/pages/schedule/schedule' })
          }
        }
      })
    }
  }
})
