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
 *    M0 只有 1 条假数据，是把它写对的最好时机。
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
const { ARTIST_CONTACT } = require('../mock/data')

function getContact(artistId) {
  // ① 开关关掉 → 不返回
  if (!ARTIST_CONTACT.show_wechat) return {}
  // ② 不是这个化妆师 → 不返回
  if (artistId !== ARTIST_CONTACT.artist_id) return {}
  return { wechat_id: ARTIST_CONTACT.wechat_id }
}

module.exports = { getContact }
