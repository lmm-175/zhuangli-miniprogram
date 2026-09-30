const { getArtist, saveArtist } = require('../../utils/artistStore')
const { TOAST } = require('../../utils/toast')

/**
 * 我的资料（妆师端 · 可编辑）
 *
 * 🔴 数据只有一个入口：artistStore.getArtist()。
 *    ⛔ 这一页不许 require ARTIST_CONTACT / utils/contact.js ——
 *    微信号（wechat_id）只能走 showContact 云函数「校验后单独返回」那条路，
 *    永远不许跟昵称/城市这些公开字段躺在同一个对象里被整包传出去。
 *    （自测里有三条断言专门钉这件事，改这个文件必重跑。）
 *
 * 📌 2026-09-30（第十七处）这一页【从只读改成可编辑】。
 *    上一版这里写的是「M0 只有展示，没有任何编辑入口：⛔ 不放修改资料按钮」——
 *    那句话整个反过来了，用户原话：「我的资料里面接妆风格改成可选择的，
 *    现在这版选不了；常驻城市可以打字输入；昵称可以打字输入；再加一行简介」。
 *    ⚠️ 但「只读」那版留下的两条约束**仍然有效**：白名单（没有 wechat_id）、
 *       以及「每个键都要有着落」—— 所以这一页四个键**没有一个是空的**。
 *
 * 📌 四行的落点分两种：
 *    · 昵称 / 常驻城市 → wx.showModal({editable:true}) 就地问一句，原地改完
 *    · 接妆风格 / 简介 → 各走一个整页（词表要铺 5 组 16 个 chip、简介要 200 字）
 *    两种都行是因为**用户当场定的**：弹框能改的别开页，开页的别塞弹框。
 *    ⛔ 头像是整块冻结的（云开发方案，等 M0 过审），所以那张卡片**不加手势** ——
 *       点了没反应的第 5 种长相就是「看着像能点，其实不能」，宁可它明显不像键。
 *
 * ⚠️ 校验【一处实现】：页面不预判字数、不自己拼话术，只管把
 *    saveArtist() 返回的 error 原样播出去（规矩 11）。
 * ⚠️ 保存之后【不 navigateBack】—— 她多半还要接着改下一项，
 *    弹回上一页等于每改一项就要重进一次。
 * 🔴 ⛔ 全页不许出现 wx.hideKeyboard()（规矩 20）。弹框收起后后面没有
 *    紧跟的触摸序列要保护，而这一页……⚠️ 其实**真的可能有键盘开着**
 *    （弹框本身就是输入框），正是规矩 20 划的红线区。
 */
Page({
  data: {
    // ⚠️ 初值先给个能渲染的空壳，真数据在 onShow 里灌。
    //    不在这儿调 getArtist()：模块加载期碰 storage 会让自测的桩
    //    「还没装上就被读了一次」，那种时序 bug 查起来最费劲。
    artist: { nickname: '', city: '', style_text: '', intro: '', initial: '妆' },
    // 简介那一行只显示字数，⛔ 不显示正文 —— 200 字会把这一页整个撑开
    introLen: 0
  },

  /* ⚠️ 必须写在 onShow 里，⛔ 不是 onLoad：
     从 style-edit / intro-edit 返回时页面【不重新执行 onLoad】，
     只靠 data 初值会一直显示旧值（「改了风格，回来看还是老的」）。
     同理，小程序从后台恢复也不重跑模块。 */
  onShow: function () {
    this.refresh()
  },

  /* 重读的唯一入口。
     ⚠️ 保存成功后也走这里（而不是拿 saveArtist 的返回值 setData）——
     重新读一遍 storage 才是「真写进去了」的证据；直接信返回值的话，
     万一 setStorageSync 静默失败，页面会显示新值、storage 里还是旧的，
     下次进来又变回去，中间没有任何信号。 */
  refresh: function () {
    const a = getArtist()
    this.setData({ artist: a, introLen: a.intro.length })
  },

  editNickname: function () {
    this.askText('改昵称', this.data.artist.nickname, function (v, page) {
      page.commit(saveArtist({ nickname: v }))
    })
  },

  editCity: function () {
    this.askText('改常驻城市', this.data.artist.city, function (v, page) {
      page.commit(saveArtist({ city: v }))
    })
  },

  goStyle: function () {
    wx.navigateTo({ url: '/pages/style-edit/style-edit' })
  },

  goIntro: function () {
    wx.navigateTo({ url: '/pages/intro-edit/intro-edit' })
  },

  /* ── 弹框那一句，昵称和城市共用 ────────────────────────────────────
     ⚠️ editable 模式下 content **就是输入框初值**（照 template-list.js 的先例，
        那边也是这么问漫展名的）。所以 content 传当前值，别传提示语。
     ⚠️ 按钮文案写【动作本身】：「保存 / 返回」，⛔ 不用「确定 / 取消」——
        用户实测过，「确定」这两个字没人知道确定的是什么。
     ⚠️ 点「返回」（res.cancel）**刻意不出声**：那不是失败，是改主意。
        这是全页唯一一处静默分支，⛔ 别拿规矩 22 来「修」它。 */
  askText: function (title, cur, onOk) {
    const page = this
    wx.showModal({
      title: title,
      editable: true,
      content: cur || '',
      confirmText: '保存',
      cancelText: '返回',
      success: function (res) {
        if (!res.confirm) return
        onOk(res.content, page)
      },
      // ⚠️ 弹框根本没打开也要出声 —— 不出声就是「点了行、什么都没发生」，
      //    正是这个项目被坑过四轮的那句话。
      fail: function () {
        wx.showToast({ title: TOAST.MODAL_FAILED, icon: 'none' })
      }
    })
  },

  /* 保存结果统一处理：成功就重读 + 出声，失败就把 store 给的话原样播出去。
     ⛔ 失败时【一个字都不 setData】—— 输入框里那个非法值不该出现在
        页面上（页面显示的永远是 storage 里真实存着的东西）。 */
  commit: function (r) {
    if (!r || !r.ok) {
      wx.showToast({ title: (r && r.error) || TOAST.SAVE_FAILED, icon: 'none' })
      return
    }
    this.refresh()
    wx.showToast({ title: TOAST.SAVED, icon: 'success' })
  }
})
