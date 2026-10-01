const { getArtist, saveArtist, INTRO_MAX } = require('../../utils/artistStore')
const { TOAST } = require('../../utils/toast')

/**
 * 简介（妆师端 · 200 字以内）
 *
 * 落点：我的资料 →「简介」行（pages/my-profile/my-profile.js 的 goIntro）。
 * 用户原话：「再加一行简介，点击可以输入200字以内内容」。
 *
 * 📌 这段字最后出现在哪儿：**顾客的分享页 C1**（pages/landing/），
 *    摆在妆位表【下面】—— 不是上面。C1 的头等大事是「选这个妆位」，
 *    200 字放上面会把它挤到首屏外。见 landing.wxml 那段注释。
 *
 * 🔴 「保存」键放**导航栏右侧**，⛔ 不放底部 `.footbar`。这是这一页唯一的
 *    设计要点，理由跟「点了没反应」有关：
 *    textarea 一聚焦，**键盘从底部升起**，底部那条 `.footbar` 正好被盖住 ——
 *    手指落下去点到的其实是键盘，而按钮看着就在那儿。这是「点了没反应」的
 *    第 5 种长相，这个项目已经在那个坑里待过四轮（README 第 20/21/22/26 条）。
 *    导航栏永远在屏幕最上面，键盘够不着它。
 *    先例：pages/artist-list/artist-list.wxml 已经有「导航栏右侧放一个字键」。
 *
 * ⚠️ `maxlength` 只是 **UI 层拦截**（超了它就不让再打），
 *    `validateIntro` 才是**判据**（规矩 11：一处实现）。两者都留着：
 *    前者挡住「打进去才发现」，后者挡住「粘进来 / 老数据本来就是超长的」。
 * ⚠️ 计数用 `.length`（UTF-16 码元数），跟 validateIntro 用的是**同一个单位** ——
 *    换成 [...str].length 之类的码点数，就会出现「计数器说 199、校验说超了」。
 *
 * 🔴 ⛔ 不许出现 wx.hideKeyboard()（规矩 20）。这一页**真的有键盘**，
 *    正是那个函数最容易被顺手加上的地方 —— 加它就会打断当前触摸序列，
 *    紧跟的保存/返回在部分基础库上被整个吃掉，而且不报错。
 */
Page({
  data: {
    intro: '',
    len: 0,
    max: INTRO_MAX,
    saving: false
  },

  onLoad: function () {
    const a = getArtist()
    this.setData({ intro: a.intro, len: a.intro.length })
  },

  onInput: function (e) {
    const v = e.detail.value
    this.setData({ intro: v, len: v.length })
  },

  onSave: function () {
    if (this.data.saving) return
    this.setData({ saving: true })
    const r = saveArtist({ intro: this.data.intro })
    this.setData({ saving: false })
    if (!r.ok) {
      // ⚠️ 失败【不退出】—— 退出等于把她刚写的 200 字一起丢掉。
      wx.showToast({ title: r.error, icon: 'none' })
      return
    }
    /* ⚠️ toast 之后**立刻** navigateBack，⛔ 不套 setTimeout：
       套了就是「点了保存，先愣一下才退」，而且那个延迟里用户还能再点一次。
       ⚠️ 也不传延时参数给 showToast —— 它会提前把页面切走、把 toast 一起带走。 */
    wx.showToast({ title: TOAST.INTRO_SAVED, icon: 'success' })
    wx.navigateBack()
  }
})
