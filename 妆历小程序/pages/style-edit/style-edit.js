const { getArtist, saveArtist, toStyleOptions, toggleTag } = require('../../utils/artistStore')
const { TOAST } = require('../../utils/toast')

/**
 * 接妆风格（妆师端 · 整页多选）
 *
 * 落点：我的资料 →「接妆风格」行（pages/my-profile/my-profile.js 的 goStyle）。
 * 用户原话：「我的资料里面接妆风格改成可选择的，现在这版选不了」。
 *
 * 📌 用户 2026-09-30 当场定的两条：
 *    ① **只用固定词表**（mock/data.js 的 STYLE_GROUPS，5 组 16 个词），
 *       ⛔ 不做自定义词。理由不是省事：接妆风格要出现在**顾客的分享页**上，
 *       而顾客端要靠它筛人。自由词会立刻长出「浓妆」「浓颜」「浓系」三种写法，
 *       同一个人在三场漫展上被写成三类。
 *    ② 保存后**退回资料页**（跟她改昵称那种「原地存完接着改下一项」不同）——
 *       这一页是整屏的，退出来才知道自己把资料改成什么样了。
 *
 * 🔴 ⛔ 这一页不许另抄一份 16 项词表。`STYLE_GROUPS` 在 mock/data.js 里
 *    自己写着「全站唯一来源」，artistStore 的 ALL_TAGS 就是它摊平的产物。
 *    自测里有一条专门钉「这一页源码里不出现第二份词表」。
 *
 * 🔴 ⛔ 不许出现 wx.hideKeyboard()（规矩 20）。这一页没有输入框，
 *    键盘不可能开着；这一页调它 = 白白打断一次触摸序列。
 */
Page({
  data: {
    groups: [],
    picked: [],
    saving: false
  },

  onLoad: function () {
    const a = getArtist()
    this.setData({
      groups: toStyleOptions(a.style_tags),
      picked: a.style_tags.slice()
    })
  },

  /* 点一个词：勾选态和 picked 一起更新。
     ⚠️ toggleTag 是纯函数（不 mutate 入参、返回新数组）——
        直接 push/splice `data.picked` 会让 setData 的 diff 判不出变化。 */
  onTag: function (e) {
    const name = e.currentTarget.dataset.name
    const picked = toggleTag(this.data.picked, name)
    this.setData({ picked: picked, groups: toStyleOptions(picked) })
  },

  /* ⚠️ 一个都没选就【不保存、不退出】，只出声。
     判据在 store 里（validateStyleTags），这一页不预判 —— 规矩 11，
     校验规则一份、失败话术也只有一处。 */
  onSave: function () {
    if (this.data.saving) return          // 防连点：连点两次会写两次 storage
    this.setData({ saving: true })
    const r = saveArtist({ style_tags: this.data.picked })
    this.setData({ saving: false })
    if (!r.ok) {
      wx.showToast({ title: r.error, icon: 'none' })
      return
    }
    // ⚠️ 退回资料页 —— 那一页的 onShow 会重读 storage，所以往回退之后
    //    看到的一定是刚落库的值（而不是这一页传过去的影子）。
    wx.showToast({ title: TOAST.STYLE_SAVED, icon: 'success' })
    wx.navigateBack()
  }
})
