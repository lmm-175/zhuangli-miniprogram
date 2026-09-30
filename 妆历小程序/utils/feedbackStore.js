/**
 * 妆历 · 问题反馈的投递（2026-09-30 第十九处新增）
 *
 * 🔴 这个文件是「反馈怎么发出去」的【唯一一处实现】。页面只负责
 *    拿一个字、按一下键、把结果播出来（规矩 11：同一件事只许一处实现）。
 *
 * 用户原话：「‘我的’界面添加反馈模块，用户点进去可以输入文字进行对小程序
 *           的问题反馈，点击确认反馈就能把反馈发到小程序开发那」
 * 岔路他当场选的是「现在就接云开发（真发送）」——
 * 所以这是全项目第一条【真的会写云端】的数据通道（别的都还是本机 storage）。
 *
 * ══════════════════════════════════════════════════════════════════════
 * 写进哪儿：云数据库的 `feedback` 集合。一条记录长这样：
 *
 *     { text: '……', created_at: <服务端时间>, _openid: '<微信自动加>' }
 *
 * ⚠️ 只有 text 是我们写进去的。`_openid` 由云数据库自动带上 ——
 *    它同时也是「仅创建者可读写」这条权限的判据（见 README §6 的三步配置）。
 * 🔴 **⛔ 不收集任何联系方式**。用户没要求，而且这个项目有一条硬红线：
 *    微信号只能走 utils/contact.js（对应云函数 showContact）。
 *    反馈是【单向】的：她写、开发者看。要回访就靠 _openid 在管理端找。
 * ══════════════════════════════════════════════════════════════════════
 */
const { TOAST } = require('./toast')
const { isConfigured, initCloud } = require('./cloud')

/* ⚠️ 集合名写在这里，⛔ 别在页面上再写一遍字面量。 */
const COLLECTION = 'feedback'

/* 反馈最多多少字。
   🔴 这个数字是【唯一的上限来源】：feedback.wxml 的 textarea 和字数计数器
      都绑它（`maxlength="{{max}}"`），所以页面上⛔ 不出现第二个数字。
   ⚠️ 和 intro-edit 一个道理：**有计数器的地方才敢用 maxlength**
      —— 没有计数器时 maxlength 就是【静默截断】（style-edit 那边就是这么栽的，
      见 artistStore 的 CUSTOM_MAX 注释）。这一页有计数器，所以用它。
   ⚠️ 那为什么下面 validateFeedback 还要判一次长度？因为 maxlength 是**页面**
      的保证，而这一层是**数据**的保证（规矩 11 的老话：写入点也要判）。
      和 validateIntro 对 INTRO_MAX 的处理完全同形。 */
const FEEDBACK_MAX = 500

/* 校验 —— 纯函数，不打桩 wx（自测直接喂）。
   ⚠️ 先 trim 再判空：全是空格的反馈没有意义，放过去的话开发者那一边
      收到的是一条空记录（同 validateIntro 先 trim 的理由）。
   ⚠️ 中间的空行 / 换行一律保留：那是她分段的正文，不是格式噪声。 */
function validateFeedback(text) {
  const s = String(text == null ? '' : text).trim()
  if (!s) return { ok: false, error: TOAST.FEEDBACK_EMPTY }
  if (s.length > FEEDBACK_MAX) {
    return { ok: false, error: TOAST.FEEDBACK_LONG.replace('N', String(s.length)) }
  }
  return { ok: true, value: s }
}

/* 投递。**回调式**（同 wx.showModal 那套），⛔ 不改成 Promise ——
   页面那边要写的是「成功就退回去、失败就出声」，回调一眼看得完。
   回调参数是一个对象 `{ ok, error }`，⚠️ 两个分支【都必须被页面播出来】，
   ⛔ 没有「静默失败」这个选项（规矩 22）。

   🔴 三种发不出去的情况，全都走 `done({ok:false})` 并带一句话：
      ① 校验不过（空 / 太长）→ validateFeedback 给的话；
      ② 云环境没配（utils/cloud.js 的 CLOUD_ENV 是空的）→ FEEDBACK_FAILED；
      ③ 云端写入失败（没网 / 权限配错 / 集合不存在）→ FEEDBACK_FAILED。
      ⚠️ ②和③共用一句话是有意的：**对她说的是同一件事**（这次没发出去）。
         具体差在哪儿要让【开发者】知道 —— ②走的是 console.error，
         ③走的是 wx.cloud 自己打的那条错误。
      ⛔ 绝对不许把②变成「假装成功」：她按了确认、屏幕上弹出「已发出」，
         而云端什么都没有，然后她等一个永远不会来的回复。 */
function submitFeedback(text, done) {
  const cb = typeof done === 'function' ? done : function () {}
  const v = validateFeedback(text)
  if (!v.ok) {
    cb({ ok: false, error: v.error })
    return
  }
  if (!isConfigured()) {
    console.error('[feedback] 发不出去：utils/cloud.js 的 CLOUD_ENV 是空的。'
      + '配置步骤见 README §6。')
    cb({ ok: false, error: TOAST.FEEDBACK_FAILED })
    return
  }
  /* ⚠️ 这里再调一次 initCloud()：app.onLaunch 里已经调过一次，多调一次是
     幂等的（wx.cloud.init 可以重复调）。这么写是为了**顺序不依赖**
     「App 一定先于页面跑」—— 自测打桩、将来某个页面单独进来，都不至于
     在一个没 init 过的 wx.cloud 上调 database()（那会直接抛异常）。 */
  initCloud()
  if (!wx.cloud || !wx.cloud.database) {
    console.error('[feedback] 这个基础库没有 wx.cloud.database。')
    cb({ ok: false, error: TOAST.FEEDBACK_FAILED })
    return
  }
  try {
    wx.cloud.database().collection(COLLECTION).add({
      data: {
        text: v.value,
        /* ⚠️ 服务端时间，⛔ 不是 `new Date()`：设备时间是可以被用户改的，
           而反馈的价值一半在「她是什么时候遇到的」。 */
        created_at: wx.cloud.database().serverDate()
      }
    }).then(function () {
      cb({ ok: true })
    }).catch(function () {
      // 没网 / 权限配成了「仅管理端可写」/ 集合还没建 —— 都落到这一句。
      cb({ ok: false, error: TOAST.FEEDBACK_FAILED })
    })
  } catch (e) {
    // database() 本身抛异常（没 init 成功之类）。⛔ 也要出声。
    cb({ ok: false, error: TOAST.FEEDBACK_FAILED })
  }
}

module.exports = { COLLECTION, FEEDBACK_MAX, validateFeedback, submitFeedback }
