const { getArtist, saveArtist, AVATAR_COLORS } = require('../../utils/artistStore')
const { TOAST } = require('../../utils/toast')
const { syncTabBar } = require('../../utils/tabbar')

/**
 * 壳 3 · 我的（妆师端）
 *
 * 🔴 数据只有一个入口：artistStore.getArtist()（⛔ 不许 require ARTIST_PUBLIC
 *    当数据源 —— 它自第十七处起只是播种用的 seed）。
 *
 * 📌 2026-09-30（第十九处）：
 *    · 头像卡片和「我的资料」合并 ⇒ 整张卡 `bindtap="goProfile"`；
 *      头像 `catchtap="toggleColors"`（子键在可点的父容器里 ⇒ 必须 catch，
 *      用 bindtap 会冒泡成「又进资料页又开调色板」）。
 *    · 头像底色由妆娘自己挑，令牌存在 `zhuangli_artist.avatar_color`。
 *    · 「关于妆历」删了（设置页里有同一条），新增「问题反馈」。
 */
Page({
  data: {
    /* ⚠️ 初值是个能渲染的空壳，真数据在 onShow 里灌（理由见 onShow）。
       ⚠️ 这里的 `avatar_color: 'rose'` 只是【首帧的兜底】——
          真正的默认值只有一处（artistStore 的 AVATAR_COLOR_DEFAULT），
          读回来的值永远过 avatarColorOf，所以这里写错了也影响不到正确性，
          但它会让首帧闪一下别的颜色，⛔ 别改成另一个令牌。
       ⚠️ `colors` 是模块常量（⛔ 不是 storage 数据），所以敢放进初值：
          它不随进出页面变化，放进 onShow 反而每次都要 setData 一遍。 */
    artist: { nickname: '', city: '', style_text: '', intro: '', avatar_color: 'rose' },
    colors: AVATAR_COLORS,
    // 调色板开着没有。⚠️ 纯 UI 态：⛔ 不进 store、⛔ 不落 storage ——
    // 下次进这一页它就该是收着的（同 style-edit 的 draft / openGroup 的地位）。
    colorsOpen: false
  },

  /* ⚠️ 读真数据必须在 onShow，⛔ 不能写进 data 初值 ——
     页面模块只求值一次然后被缓存，写进初值的话第二次进来还是第一份。
     ⚠️ 这一页尤其需要 onShow：她改完资料是**退回这一页**的
     （my-profile 的返回键 / 底部 Tab），不重读就还是旧名字。
     ⚠️ 也顺手收起调色板：她从资料页退回来时，一个「开着但没在挑色」的面板
        是上一个动作的残留。 */
  onShow: function () {
    // 第一行：把底部那条点亮（本页是妆师端第 3 格）。见 utils/tabbar.js
    syncTabBar(this)
    this.setData({ artist: getArtist(), colorsOpen: false })
  },

  /* 点头像 = 开/关调色板。⚠️ 是个【开关】不是「打开」：
     再点一次要能收起来 —— 键本身没有文字，收起来的路只有它自己
     （⛔ 别指望用户去点蒙层，这一页没有蒙层，那是搜索面板的做法）。 */
  toggleColors: function () {
    this.setData({ colorsOpen: !this.data.colorsOpen })
  },

  /* 选一个底色。
     ⚠️ 【当场落库】，⛔ 没有「保存」键：这一页是 Tab 页，没有底部按钮的位置，
        也没有第二个要一起提交的字段 —— 一次点击一次写入，原子。
     ⚠️ 选完【不收起面板】：她多半要挨个试（6 颗色点就在眼前）。
        哪颗是当前色由那颗点上的圈圈说（`.pal-dot.on`），
        卡片头像跟着变色是第二处证据。收起 = 再点一下头像。
     🔴 两条失败路径都必须出声（规矩 22）：
        ① `r.ok === false` → saveArtist 自己给的 error（storage 写失败）；
        ② **写进去了、读回来却不是它** → 这是最阴的一种：setStorageSync
           在某些机型上会静默失败，不看返回值的话「她点了颜色、什么都没变、
           也没有一句话」，正是这个项目最怕的形状。所以下面**重新读一遍
           storage** 再比（同 my-profile.refresh 的理由，两页口径一致）。 */
  pickColor: function (e) {
    const token = e.currentTarget.dataset.token
    const r = saveArtist({ avatar_color: token })
    if (!r.ok) {
      wx.showToast({ title: r.error, icon: 'none' })
      return
    }
    const a = getArtist()
    if (a.avatar_color !== token) {
      this.setData({ artist: a })
      wx.showToast({ title: TOAST.SAVE_FAILED, icon: 'none' })
      return
    }
    this.setData({ artist: a })
  },

  // ⛔ 别在这里又改成弹 toast —— 那正是第十四处要修的病（缺的是落点页）。
  goProfile: function () {
    wx.navigateTo({ url: '/pages/my-profile/my-profile' })
  },

  // §9.4 #6 的落点页 → 壳 4
  goSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  /* 问题反馈（第十九处新增）。⚠️ 落点页是 pages/feedback/，
     ⛔ 这里不许再出现 goAbout 那种「只弹一句」的形状。 */
  goFeedback: function () {
    wx.navigateTo({ url: '/pages/feedback/feedback' })
  },

  // 切换身份：回到角色选择（约妆 / 妆师）
  switchRole: function () {
    wx.navigateTo({ url: '/pages/role-select/role-select' })
  }
})
