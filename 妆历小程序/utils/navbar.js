/**
 * 自定义导航栏的几何 —— 导航栏组件和页面共用一份。
 *
 * 为什么要单独抽出来：导航栏高度【不止导航栏自己要用】。
 * 「档期模板」页那个可拖动的圆形「＋」按钮，拖动时不许越过导航栏下沿 ——
 * 它就得知道导航栏底在哪。两边各算一遍迟早算歪，而胶囊那个接口本来就
 * 会返回离谱的值（见下面两道闸），所以只算一次，谁要用谁来取。
 *
 * 拆成「纯函数 + 一层薄 wx 包装」，跟 utils/schedule.js 一个路子：
 * 纯的那部分进得了自测，不用打桩 wx。
 *
 * ⚠️ 这里的单位全是 px，不是 rpx。导航栏高度、胶囊位置、拖动位移
 *    都是【设备物理量】，不跟屏宽缩放。
 */

const FALLBACK = { statusH: 20, navH: 44, capsulePad: 96 }

/**
 * 纯函数：窗口信息 + 胶囊矩形 → 导航栏几何。
 * rect 传 null、传全 0、传离谱的值都可以，会退回默认。
 *
 * 两道闸的来历：wx.getMenuButtonBoundingClientRect() 在某些基础库 / 机型上
 * 会返回全 0 或半个屏宽那样的数。capsulePad 一旦算成「半个屏宽」，
 * 右侧那一整组动作就宽过导航栏，整组掉到左上角压住标题 ——
 * 真机上就是这么撞见的（档期页「模板」叠标题）。所以：
 *   ① 数值得像个真胶囊：高 > 0、贴右半边、宽度小于半屏；
 *   ② 算出来的避让宽也不许超过半屏。
 */
function navMetrics(info, rect) {
  const i = info || {}
  const winW = i.windowWidth || 375
  const winH = i.windowHeight || 667
  const statusH = i.statusBarHeight || FALLBACK.statusH

  let navH = FALLBACK.navH
  let capsulePad = FALLBACK.capsulePad

  if (rect && rect.height > 0 && rect.left > winW * 0.5 && rect.width < winW * 0.5) {
    // 上下留白对称 → 导航栏高度 = (胶囊顶 - 状态栏) * 2 + 胶囊高
    const h = (rect.top - statusH) * 2 + rect.height
    if (h >= 32 && h <= 80) navH = h
    // 胶囊左边缘到屏右边的距离 = 我们右侧动作必须让出的宽度
    const pad = Math.max(0, winW - rect.left) + 8
    if (pad <= winW * 0.45) capsulePad = pad
  }

  // 底部安全区（全面屏那条横杠）。safeArea 是屏幕坐标，
  // windowHeight 是窗口高度；自定义导航栏时窗口从 y=0 开始，两者能直接相减。
  const safe = i.safeArea
  const insetBottom = (safe && safe.bottom) ? Math.max(0, winH - safe.bottom) : 0

  return {
    statusH,
    navH,
    capsulePad,
    winW,
    winH,
    navBottom: statusH + navH,   // 导航栏下沿 —— 浮层不许越过这条线
    insetBottom
  }
}

/** 取真实值（拿不到就用默认，最多是差几个像素，不会崩）。 */
function getNavMetrics() {
  let info = {}
  let rect = null
  try {
    info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}
  } catch (e) {}
  try {
    rect = wx.getMenuButtonBoundingClientRect()
  } catch (e) {}
  return navMetrics(info, rect)
}

/**
 * 浮层的可拖动范围：左右贴着屏幕，上不许越过导航栏下沿（那上面是导航栏，
 * 压过去就等于把标题和「‹ 返回」盖住了），下让开全面屏的横杠。
 */
function fabBounds(nm) {
  return {
    left: 0,
    top: nm.navBottom,
    right: nm.winW,
    bottom: nm.winH - nm.insetBottom
  }
}

/**
 * 把可拖动的圆钮夹回允许的范围里：圆钮（左上角 x,y + 边长 size）必须整个落在 box 内。
 * 「贴着边」算合法。viewport 比圆钮还小的极端情况下，
 * 至少保证左上角不越界（不然圆钮会整个飞出屏幕）。
 */
function clampFab(x, y, size, box) {
  const b = box || {}
  const left = Number(b.left) || 0
  const top = Number(b.top) || 0
  const maxX = Math.max(left, (Number(b.right) || 0) - size)
  const maxY = Math.max(top, (Number(b.bottom) || 0) - size)
  return {
    x: Math.min(Math.max(Number(x) || 0, left), maxX),
    y: Math.min(Math.max(Number(y) || 0, top), maxY)
  }
}

/** 初始位置：右下角，离屏幕边留 margin。 */
function fabHome(size, margin, box) {
  const m = Number(margin) || 0
  return clampFab(box.right - size - m, box.bottom - size - m, size, box)
}

module.exports = { navMetrics, getNavMetrics, fabBounds, clampFab, fabHome }
