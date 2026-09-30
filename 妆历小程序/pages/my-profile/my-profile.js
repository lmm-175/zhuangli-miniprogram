const { ARTIST_PUBLIC } = require('../../mock/data')

/**
 * 我的资料（妆师端 · 只读）
 *
 * 🔴 只 require ARTIST_PUBLIC，⛔ 绝不碰 ARTIST_CONTACT / utils/contact.js ——
 *    微信号（wechat_id）只能走 showContact 云函数「校验后单独返回」那条路，
 *    永远不许跟昵称/城市这些公开字段躺在同一个对象里被整包传出去。
 *    （自测里有一条断言专门钉这件事，改这个文件必重跑。）
 *
 * M0 这一页只有展示，没有任何编辑入口：⛔ 不放「修改资料」按钮，
 * 免得又造出一个点了没反应的键 —— 这个项目已经被那四个字坑了三轮。
 */
Page({
  data: {
    artist: ARTIST_PUBLIC,
    // 头像位的首字，跟「我的」页那个字母位同一个做法
    initial: String(ARTIST_PUBLIC.nickname || '妆').slice(0, 1)
  }
})
