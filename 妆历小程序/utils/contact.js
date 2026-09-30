/**
 * 唯一返回微信号的出口。
 *
 * 🔴 为什么单独一个文件：
 *    artists.wechat_id 绝不能并进 mock/data.js 的 ARTIST_PUBLIC，
 *    也绝不能出现在任何「主页 / 列表」接口的返回值里 ——
 *    它只能由这里（对应云函数 showContact）校验后单独返回。
 *
 *    这条约束的现实后果是：化妆师的微信号被别人翻两下主页就拿走了，
 *    而她本人并不知道。这是全项目最容易写错、也最致命的一处。
 *    M0 是假数据，是把它写对的最好时机。
 *    📌 2026-09-30（第二十处）：妆娘从 1 位变成 3 位 —— ⛔ 「多几位」不改变
 *       任何一个字：这里仍然是全项目**唯一**返回微信号的地方，
 *       仍然按 artist_id 一条一条查、仍然开关关掉就整行不渲染。
 *
 * 校验两条（M1 由云函数在服务端做，前端不参与判断）：
 *    ① 化妆师本人的「展示微信号」开关是开的；
 *    ② 调用方有资格拿（M1：存在预约关系）。
 *    任一条不满足 → 返回 {} → C1 上整个微信号那一行不渲染。
 *
 * M1 把函数体换成：
 *    return wx.cloud.callFunction({
 *      name: 'showContact',
 *      data: { artist_id: artistId }
 *    }).then(res => res.result)
 */
const { ARTIST_PUBLIC, ARTIST_CONTACT } = require('../mock/data')

/* 按 artist_id 查那一条。
   📌 2026-09-30（第二十处）：ARTIST_CONTACT 从【单对象】改成【数组】——
      妆娘不止一位了，得按人查。校验的两条一个字没变，只是「这个化妆师」
      从「唯一的那一个」变成「传进来的那一个」。
   ⚠️ 查不到就返回 undefined ⇒ 下面第一条直接不返回 {}。
      ⛔ 别回落成「随便挑一条」：那正是「在阿黎的页面上看到小满的微信号」，
         比不显示严重得多，而且不报错。 */
function contactOf(artistId) {
  const id = String(artistId == null ? '' : artistId)
  if (!id) return null
  return ARTIST_CONTACT.filter((c) => c && c.artist_id === id)[0] || null
}

function getContact(artistId) {
  const c = contactOf(artistId)
  // ② 不是这个化妆师（或根本查不到）→ 不返回
  if (!c) return {}
  // ① 开关关掉 → 不返回
  if (!c.show_wechat) return {}
  return { wechat_id: c.wechat_id }
}

/* ══ 妆娘端设置页要问的那一句：「我这个开关现在是开是关」═════════════════
   📌 2026-09-30（第二十处）新增。它修的是一个**真回归**：
      `pages/settings/settings.js` 原来直接 require 了 ARTIST_CONTACT、
      读 `ARTIST_CONTACT.show_wechat`。这一轮 ARTIST_CONTACT 从单对象变成数组，
      那一行读到的就成了 `undefined` —— 开关**恒显示成「关」**，而且不报错。
      （自测当时一条都没覆盖到它，所以是改完第二轮才发现的。）

   🔴 所以它必须走这个文件：ARTIST_CONTACT 的**唯一合法消费者**是 contact.js，
      页面直接 require 它本来就是违规（README §「数据层」那条写着）。
   ⚠️ 但它【不是】getContact 的另一种用法 —— 那个回答的是「客户能不能拿到号码」，
      「开关关掉」和「查不到这个人」它都返回 {}（对客户来说是一回事：都没号码）。
      拿 {} 去驱动开关，一个「查不到」会显示成「已关闭」，她就以为是自己关的。
      设置页要区分的正是这两件事，所以单开一个口子。
   🔴 它【只回答一个布尔、永远不吐 wechat_id】：开关状态和号码是两样东西，
      设置页不需要号码，就不给它 —— 微信号的出口越少越好，这是这个文件存在的全部理由。 */
function myShowWechat() {
  const pub = ARTIST_PUBLIC || {}
  const c = contactOf(pub.artist_id)
  return !!(c && c.show_wechat)
}

module.exports = { getContact, myShowWechat }
