const { getStyleState, saveArtist, toStyleView, toggleTag,
        toggleCustomTag, addCustomTag, removeCustomTag } = require('../../utils/artistStore')
const { TOAST } = require('../../utils/toast')

/**
 * 接妆风格（妆师端 · 整页多选 + 每一组可自填）
 *
 * 落点：我的资料 →「接妆风格」行（pages/my-profile/my-profile.js 的 goStyle）。
 *
 * 📌 2026-09-30（第十八处）：用户把「只用固定词表」那条决定**推翻了**，原话：
 *    「接妆风格除了我列出的那些选项，妆面质感，场合，浓度 题材 其他
 *      妆娘可以自填选项，你只给了选项，用不着顾客搜，顾客搜不着就搜不着吧」
 *    ⚠️ 旧注释给的理由是「顾客端要靠它筛人」—— 那句话**在代码里从来不存在**
 *       （4 个消费者只显示 style_text，没有一处按风格词筛人），是句假话，已删。
 *    ⚠️ 后半句「用不着顾客搜，顾客搜不着就搜不着吧」是一条【豁免】，也是
 *       一次【明确的不做】：⛔ 不许给顾客端加按风格搜索/筛选去"补上"这个洞。
 *
 * 📌 用户当天定的四条：
 *    ① 每个分组各带一个「＋ 自定义」（⛔ 不是页面底部统一一个）
 *    ② 点词本体＝勾选/取消勾选（预设、自填一样）；**点 ✕＝删掉**
 *       （只有自填词有 ✕；⛔ 预设词不能删）—— 原话：
 *       「点自己的词是勾选，点词旁边的叉叉是删除，系统设定的词不能删，
 *        妆娘自定义可以删」
 *    ③ 输入框里还有没点「添加」的字时，点保存 / 换到另一组 → **拦住她说一句**，
 *       ⛔ 不自动加（她没点过的操作不该自己发生）
 *    ④ 保存键**留在底部**（用户明确选的；⛔ 别自作主张挪到导航栏）
 *
 * 🔴 ⛔ 这一页不许另抄一份 16 项词表。`STYLE_GROUPS` 在 mock/data.js 里
 *    自己写着「全站唯一来源」，artistStore 的 ALL_TAGS 就是它摊平的产物。
 *    自测里有一条专门钉「这一页源码里不出现第二份词表」。
 *
 * 🔴 ⛔ 不许出现 wx.hideKeyboard()（规矩 20）。规矩 20 的判据是
 *    「这一页此刻有没有可能开着键盘」—— 这一页**现在会了**（上一版那句
 *    「这一页没有输入框，键盘不可能开着」已经变成假话，所以重写在这里）。
 *    结论仍然是「不调」：没有一处分支需要它。保存键确实可能被键盘盖住，
 *    但那个洞是用「添加成功后收起输入框」填的（见 onAdd），不是用它填的。
 */
Page({
  data: {
    // toStyleView 的产物：勾选态 + 每一组（含她自己加的词）
    groups: [],
    picked: [],
    // 两个来源：视图**只**从这两个算出来，⛔ 页面不许自己拼视图
    presets: [],
    custom: [],
    // UI 态：⛔ 不进 store、不落库
    openGroup: '',   // 现在开着输入框的是哪一组（'' = 都没开）
    draft: '',       // 输入框里还没点「添加」的字
    saving: false
  },

  onLoad: function () {
    const s = getStyleState()
    this.paint(s.presets, s.custom)
  },

  /* 🔴🔴 唯一一个 setData 的地方（⛔ 别的 handler 不许自己 setData）。
     它一次做三件事：算视图、写下来、附上可选的 UI 态 ——
     ⇒ 「改了 picked 却忘了重算 groups」这类漏一半的错，在结构上不可能发生
       （旧版 page 自己调两遍 toStyleOptions，漏传一次就会让自填那一行闪一下消失）。
     ⚠️ 输入框每敲一个字也走它：`draft` 只是个字符串，重算 22 个 chip 的成本
        可以忽略，换来的是「没有任何一条分支能把视图留在旧值上」。 */
  paint: function (presets, custom, extra) {
    const v = toStyleView(presets, custom)
    const patch = {
      presets: presets,
      custom: custom,
      groups: v.groups,
      picked: v.picked
    }
    if (extra) { for (const k in extra) patch[k] = extra[k] }
    this.setData(patch)
  },

  /* 🔴 全页唯一一处判「框里还有字」，两条路（保存 / 换组）共用它。
     出声之后返回 true = 拦住。⛔ 前后各写一遍判断的话，迟早只改一处。 */
  draftBlocked: function () {
    if (!String(this.data.draft || '').trim()) return false
    wx.showToast({
      title: TOAST.CUSTOM_DRAFT.replace('G', this.data.openGroup || ''),
      icon: 'none'
    })
    return true
  },

  /* 点预设词的本体：勾选/取消勾选。⛔ 预设词没有删除这回事。 */
  onTag: function (e) {
    const name = e.currentTarget.dataset.name
    this.paint(toggleTag(this.data.presets, name), this.data.custom)
  },

  /* 点自填词的本体：勾选/取消勾选（⚠️ 不是删！删走 ✕ → onDelCustom）。 */
  onToggleCustom: function (e) {
    const name = e.currentTarget.dataset.name
    this.paint(this.data.presets, toggleCustomTag(this.data.custom, name))
  },

  /* 点 ✕：删掉这颗自填词。
     ⚠️ wxml 里这个键挂的是 catchtap（⛔ 不是 bindtap）—— 它的父节点
        `.chip.mine` 是 bindtap="onToggleCustom"，用 bindtap 会冒泡成
        「又勾选又删除」。本项目为同一个形状栽过一次（README 第 21 条）。
     ⚠️ ⛔ 不弹二次确认：她按的就是写着 ✕ 的键，意图没有歧义
        （同 booking.js 清搜索历史不弹确认的先例）。规矩 22 要的是
        「每个分支都要出声」，不是「每个分支都要弹框」——
        删除的反馈就是那颗词当场从屏幕上没了。 */
  onDelCustom: function (e) {
    const name = e.currentTarget.dataset.name
    this.paint(this.data.presets, removeCustomTag(this.data.custom, name))
  },

  /* 点「＋ 自定义」：开／关这一组的输入框。
     ⚠️ 开着的那一组再点一次＝收起 —— 让每个键都有可见的反应
        （⛔ 不能点了没反应，本项目为此被坑过四轮）。
     ⚠️ 收起也要过草稿护栏：框里还有字就不收，不然那些字会跟着一起没。 */
  openAdd: function (e) {
    const g = e.currentTarget.dataset.group
    if (this.data.openGroup === g) {
      if (this.draftBlocked()) return
      this.paint(this.data.presets, this.data.custom, { openGroup: '', draft: '' })
      return
    }
    if (this.draftBlocked()) return       // 换组前，先把上一组框里的字交代掉
    this.paint(this.data.presets, this.data.custom, { openGroup: g, draft: '' })
  },

  onDraft: function (e) {
    this.paint(this.data.presets, this.data.custom, { draft: e.detail.value })
  },

  /* 点「添加」/ 键盘上的「完成」（bindconfirm 也指到这儿）。
     ⚠️ 校验一处实现：页面**不预判**，只看 store 的返回（规矩 11）。
     ⚠️ 失败时【一个字都不动】—— 输入框里的字留着，她好改（比如把 `/` 去掉）。
     🔴 成功后【清空草稿 + 收起输入框】，这是「保存键留在底部」那一条的逃生口：
        输入框一收，键盘跟着落下，底部那颗「保存」就永远点得到。
        代价是连着加两个词要多点一次「＋ 自定义」——用户选的就是这个代价。 */
  onAdd: function () {
    const r = addCustomTag(this.data.custom, this.data.openGroup, this.data.draft)
    if (!r.ok) {
      wx.showToast({ title: r.error, icon: 'none' })
      return
    }
    this.paint(this.data.presets, r.custom, { draft: '', openGroup: '' })
  },

  /* 点「丢掉」：把框里的字丢掉并收起。
     ⚠️ 静默，⛔ 不弹二次确认：键名就是意图（同 booking.js 的 clearHist 先例）。 */
  dropDraft: function () {
    this.paint(this.data.presets, this.data.custom, { draft: '', openGroup: '' })
  },

  /* ⚠️ 校验不过就【不保存、不退出】，只出声（判据全在 store 里）。
     🔴 草稿检查【必须排在 saveArtist 之前】：框里还有没加进来的字就保存，
        等于那些字被悄悄丢掉，而她看到的是「已保存」。这一步连一次
        storage 都不写（自测里有断言钉这个顺序）。 */
  onSave: function () {
    if (this.data.saving) return          // 防连点：连点两次会写两次 storage
    if (this.draftBlocked()) return
    this.paint(this.data.presets, this.data.custom, { saving: true })
    const r = saveArtist({
      style_tags: this.data.presets,
      style_custom: this.data.custom
    })
    this.paint(this.data.presets, this.data.custom, { saving: false })
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
