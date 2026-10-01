const { submitFeedback, validateFeedback, FEEDBACK_MAX } = require('../../utils/feedbackStore')
const { TOAST } = require('../../utils/toast')

/**
 * 问题反馈（妆师端 · 500 字以内）
 *
 * 落点：「我的」Tab →「问题反馈」行（pages/mine/mine.js 的 goFeedback）。
 * 用户原话：「‘我的’界面添加反馈模块，用户点进去可以输入文字进行对小程序
 *           的问题反馈，点击确认反馈就能把反馈发到小程序开发那」
 *
 * 🔴 这是全项目第一条【真的会写云端】的通道（别的都还是本机 storage）。
 *    投递实现只有一处：utils/feedbackStore.js。这一页⛔ 不碰 wx.cloud，
 *    只做三件事：拿字、按键、把结果播出来（规矩 11）。
 *
 * 🔴 「确认反馈」键放**导航栏右侧**，⛔ 不放底部（理由写在 feedback.wxml 顶上）。
 *
 * ⚠️ 三条失败路径都必须出声（规矩 22）：
 *      ① 空 / 全是空格 → validateFeedback 的话（不是这一页自己拼的）；
 *      ② 超过 500 字（粘进来的）→ 同上；
 *      ③ 没发出去（没配云环境 / 没网 / 权限不对）→ FEEDBACK_FAILED。
 *    ⛔ 全页唯一的静默分支是「她按了返回」——那不是失败，是改主意
 *    （同 my-profile 里点弹框「返回」的处理）。
 *
 * 🔴 ⛔ 不许出现 wx.hideKeyboard()（规矩 20）。这一页**真的有键盘**，
 *    正是那个函数最容易被顺手加上的地方 —— 加它就会打断当前触摸序列，
 *    紧跟的那一下在部分基础库上被整个吃掉，而且不报错。
 */
const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    text: '',
    len: 0,
    max: FEEDBACK_MAX,
    /* 正在发。⚠️ 纯 UI 态：它挡的是「连点两下发两条」。
       它还配着一个 mask 的 loading（见 onSubmit），所以这段时间里
       屏幕上写着「正在发送」—— ⛔ 别把守卫做成「点了没反应」：
       按钮看着能点、点下去什么都不发生，正是这个项目最忌讳的形状。 */
    sending: false
  },

  onInput: function (e) {
    const v = e.detail.value
    /* ⚠️ 用 `.length`（UTF-16 码元数），跟 feedbackStore 里校验用的是**同一个单位**。
       换成 [...v].length 那种码点数的写法，会出现「计数器说 499、校验说超了」。
       （同 intro-edit 的注释，两页口径必须一致。） */
    this.setData({ text: v, len: v.length })
  },

  onSubmit: function () {
    if (this.data.sending) return
    /* ⚠️ 先【预判一次】再进发送：
       校验不过时直接出声、连 loading 都不弹 —— 「空着就点确认反馈」是最常见的
       一次误触，为它闪一下「正在发送」再弹一句错误，看着像个网络问题。
       ⚠️ 判据仍然是 validateFeedback（一处实现），⛔ 这一页不自己写 `if (!text)`。 */
    const pre = validateFeedback(this.data.text)
    if (!pre.ok) {
      wx.showToast({ title: pre.error, icon: 'none' })
      return
    }
    this.setData({ sending: true })
    /* 🔴 `mask: true`：发送这段时间她点不动页面 —— 这比「让她能点、点了没反应」
       诚实得多。守卫（sending）和蒙层是两件事：蒙层挡手指，守卫挡「万一手快」。
       ⚠️ loading 的标题写的是【正在发生的事】，⛔ 不是承诺（红线 10）。 */
    wx.showLoading({ title: '正在发送', mask: true })

    const page = this
    submitFeedback(this.data.text, function (res) {
      /* 🔴 showLoading 和 showToast 是同一层的东西：
         不先 hideLoading，紧跟着的 showToast 会被 loading 蒙层压在下面看不见
         （而且 hideLoading 之后 showToast 才会显示）—— 那就会变成
         「按了确认反馈，loading 一直转」，比不弹更糟。
         ⚠️ 成功和失败【两条路】都要先清掉 loading，所以它排在最上面。 */
      wx.hideLoading()
      page.setData({ sending: false })

      if (!res.ok) {
        // 🔴 失败【不清空文本框】—— 清空等于把她刚打的一段话一起丢掉。
        wx.showToast({ title: res.error, icon: 'none' })
        return
      }
      /* ⚠️ toast 之后**立刻** navigateBack，⛔ 不套 setTimeout：
         套了就是「点了确认，先愣一下才退」，而且那个延迟里她还能再点一次
         ——（第二条会因为 sending 已经被复位而真的发出去）。
         ⚠️ 也不给 showToast 传 duration：它会把页面提前切走、把 toast 一起带走
         （同 intro-edit 的写法，两页口径一致）。 */
      wx.showToast({ title: TOAST.FEEDBACK_SENT, icon: 'success' })
      wx.navigateBack()
    })
  }
})
