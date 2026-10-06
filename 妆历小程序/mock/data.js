/**
 * M0 假数据 —— 全部是「一眼就是示例」的数据。
 *
 * ⛔ 不要换成真人照片或真实化妆师信息：审核期是公开可查的（红线 9）。
 * M1 这整个文件会被云开发的 artists / schedules / slots 取代。
 */

/* ════════════════════════════════════════════════════════════════════
   📅 daysFromToday(n) —— 示例档期的日期一律【现算】，⛔ 不写字面量。

   🔴 2026-09-30（第二十处）加它，修的是一个**真发生过**的问题：
      示例档期原先写死 `'2026-05-02'`，而那天是 2026-09-30 —— 全部已过期。
      顾客端一旦开始「只列今天及以后的场次」，整个妆位页当场变成空的，
      而且**不报错**：页面上就是一句「最近没有场次」，看着像功能没做，
      实际是数据烂了。
   ⚠️ 写死一个「更靠后的」字面量只是把同一颗雷往后挪几个月。
      日期必须是【今天】的函数，才不会又烂一次。
   ⚠️ 产出的形状不变（还是 `'YYYY-MM-DD'` 字符串）——
      规矩 16 那条「手写数据的形状必须等于产生它的纯函数的产物」照样成立。
   ⚠️ 本机时区（`setHours(0,0,0,0)` 归一化到当天零点再加减），
      ⛔ 不用 `toISOString()` —— 那个是 UTC，东八区凌晨会整体差一天。
   ════════════════════════════════════════════════════════════════════ */
function daysFromToday(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + Number(n || 0))
  // ⚠️ 手写补零，⛔ 不用 String#padStart —— 这个文件是数据文件，
  //    保持和全项目一致的 ES5 写法，少一个「基础库支不支持」的问号。
  const p2 = function (x) { return (x < 10 ? '0' : '') + x }
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
}

/* ════════════════════════════════════════════════════════════════════
   🔴 ARTIST_PUBLIC =「主页能返回的全部字段」。
      里面永远、永远不能有 wechat_id。
      微信号的唯一出口是 utils/contact.js（对应云函数 showContact）。
      这是全项目最容易写错、也最致命的一处 —— 见 README「微信号」一节。

   ⚠️ 2026-09-30（第十七处）起，它同时是 utils/artistStore.js 的【seed】——
      首次进入时由 seed() 深拷贝进 storage（key = zhuangli_artist），
      之后妆娘改的是 storage 里那份，这个常量不再变（同 SCHEDULES / TEMPLATES 的地位）。
      ⇒ ⛔ 页面里不许再 require 这个对象当数据源，一律走 artistStore.getArtist()。

   ⚠️ `style_text` 从此是【派生字段】：真相源是 style_tags + style_custom，
      artistStore.buildStyleText() 生成它。这里手写的那一份必须跟它一致
      （自测里有一条 `buildStyleText(ARTIST_PUBLIC.style_tags) === ARTIST_PUBLIC.style_text`
      专门钉这件事，也叫「手写数据的形状必须等于产生它的纯函数的产物」）。
      artistStore 只在【播种那一次】读它 —— 老 storage 里没有 style_tags 时才拿它反推。
      📌 2026-09-30（第十八处）：妆娘能自填风格词之后，「真相源」成了两个字段
         （style_tags = 选中的预设词，style_custom = 她自填的词）。
         ⛔ 「全站唯一来源」那句话对 STYLE_GROUPS 仍然成立，它是【平台词表】；
            而 style_custom 是【她的数据】。两回事，别混（同下面 EXTRA_SERVICES
            那句「推荐项来自平台封闭列表，妆娘可再自设」的形状）。

   🔴 这一行**已经被上面那条断言抓过一次**：原先手写的是「建模感 / 浓系 / 展妆」，
      那是**点选顺序**（bk-1 的妆感再加个展妆）。而 buildStyleText 按 STYLE_GROUPS
      的词表顺序排 ⇒ 妆感质感(建模感) → 场合(展妆) → 浓度(浓系)。
      ⛔ 别照着手感改回来：同一组标签换个点选次序就换一段文案的话，
         她在分享页上会看到自己什么都没改、字却变了。
   ════════════════════════════════════════════════════════════════════ */
const ARTIST_PUBLIC = {
  artist_id: 'demo',
  nickname: '示例',
  city: '上海',
  style_tags: ['建模感', '浓系', '展妆'],
  // ⚠️ 形状必须跟 storage 里那份一致（规矩 16）：第一次进来播种时按这个形状落库。
  //    ⛔ demo 故意【不给】自填词 —— 提审截图 ②（C1）上别多出东西。
  style_custom: [],
  style_text: '建模感 / 展妆 / 浓系',
  // 选填，≤200 字，顾客在分享页上能看到（2026-09-30 用户要的那一行）
  intro: '',
  // 2026-09-30（第十九处）· 头像颜色令牌，⛔ 不是色值（见 artistStore 的文件头 ③）。
  //    ⚠️ 它跟 style_custom 一样是「storage 里那份的形状」（规矩 16）——
  //       播种时由 artistStore 的 seedRecord() 一并搬过去，之后这里不再变。
  //    ⚠️ 令牌 → 颜色的映射住在 app.wxss 的 `.c-*`，这个文件里⛔ 不出现任何色值。
  avatar_color: 'rose'
}

/* ════════════════════════════════════════════════════════════════════
   👥 ARTIST_DIRECTORY —— 顾客端能看到的妆娘（2026-09-30 第二十处新增）。

   🔴 这一份【只解决「这个人是谁」】，⛔ 跟联系方式没有任何关系 ——
      每一条的形状【逐字等于】artistStore.getArtist() 的 7 个键
      （artist_id / nickname / city / style_tags / style_text /
        intro / avatar_color），**永远没有 wechat_id**。
      微信号的唯一出口仍然是 utils/contact.js。

   🔴🔴 它【不是】「平台上有哪些妆娘」的目录 —— 那是红线 1。
      顾客端那个列表的判据是「**我**约过谁」（从 BOOKINGS 里聚合出来的），
      这里的 3 位只是给那份聚合结果提供「她是谁」的资料。
      判据和资料是两回事，别把这一份当成列表本身的来源。
      ⚠️ 演示数据也守这条：这 3 位**每一位都至少有一条「我约过她」的单**
         （见下面 BOOKINGS 的 bk-1/8/9），⛔ 不许出现「列表里有她、我却从没约过」
         —— 那一眼看过去就是个人肉目录（自测里有断言钉死这条自洽性）。

   ⚠️ 为什么 demo 也在这儿（getArtistById('demo') 明明走 storage）：
      让「3 位妆娘」这件事有个【完整的名单】，自测才能扫「每一个 artist_id
      都解析得出 7 个键」。代价是 demo 那一条与 ARTIST_PUBLIC 有重复 ——
      ⇒ 自测里有一条逐字段比这两份，防止它们哪天各改各的（规矩 16）。

   ⚠️ 昵称「示例」是【既有的演示人设】，这一轮⛔ 没改它：
      改它要连带改妆娘端资料页和两张提审截图。这是已知的观感问题，
      不是漏了（README §3.5 记着）。
   ⚠️ 红线 9：⛔ 不许换成真人照片或真实化妆师信息。这三位都是漫画式网名。
   ════════════════════════════════════════════════════════════════════ */
const ARTIST_DIRECTORY = [
  {
    artist_id: 'demo',
    nickname: '示例',
    city: '上海',
    style_tags: ['建模感', '浓系', '展妆'],
    style_text: '建模感 / 展妆 / 浓系',
    intro: '',
    avatar_color: 'rose'
  },
  {
    artist_id: 'demo-mian',
    nickname: '小满',
    city: '杭州',
    style_tags: ['自然感', '淡系', '古风妆'],
    style_text: '自然感 / 淡系 / 古风妆',
    intro: '接妆五年，主攻古风正片。约妆前可以先聊聊设定，我会按人设出方案。',
    avatar_color: 'blue'
  },
  {
    artist_id: 'demo-ali',
    nickname: '阿黎',
    city: '成都',
    style_tags: ['浓系', '韩妆'],
    style_text: '浓系 / 韩妆',
    intro: '日系 cos 妆为主，早场也接。',
    avatar_color: 'amber'
  }
]

/* 🔒 只给 utils/contact.js 用。
   任何页面 / 组件直接 require 这个对象都是错的 —— 绕过了校验出口。

   📌 2026-09-30（第二十处）：从【单对象】改成【数组】——
      妆娘不止一位了，顾客在 2/3 号妆娘的妆位页上也得找得到人。
      ⚠️ 隔离契约一个字没改：每一条都跟原来那一条同形，⛔ 一个 wechat_id
         都没跑进 ARTIST_DIRECTORY（那边是给顾客看的，这边是校验出口）。
      ⚠️ 名单要和 ARTIST_DIRECTORY 对得上（自测钉着）—— 少一条的结果是
         「在阿黎的页面上找不到联系方式」，而界面上只是那一行不出现，不报错。 */
const ARTIST_CONTACT = [
  {
    artist_id: 'demo',
    wechat_id: 'demo_makeup',
    // 对应「设置 → 在分享页展示我的微信号」这个开关。
    // 关掉时 C1 上整个微信号那一行都不渲染（不是变灰，是不出现）。
    show_wechat: true
  },
  {
    artist_id: 'demo-mian',
    wechat_id: 'demo_mian_makeup',
    show_wechat: true
  },
  {
    artist_id: 'demo-ali',
    wechat_id: 'demo_ali_makeup',
    show_wechat: true
  }
]

/* ════════════════════════════════════════════════════════════════════
   🔴🔴 2026-10-01（第二十处）：`SCHEDULE` + `SLOTS` 两份夹具【已退役】。

   它们曾经是什么：C1 分享落地页（提审截图 ②）上那份**写死的**演示数据 ——
   一场「示例漫展 2026-05-02」+ 三个妆位，其中第 1 位 `busy: true`。
   现在 C1 读的是**真档期 + 真预约单**（`scheduleStore` + `bookingStore`），
   所以这两份没人读了。零消费者的常量留在文件里只会误导下一个人。

   ⚠️ **但下面这条知识没退役，⛔ 别把它一起删掉**：

     当初为什么必须写死 `busy`，而不是按预约单推？
     因为真按 `bookedSeqsOfSchedule()` 推的话，`sched-demo-0502` 的
     第 1/2/3 位会被 bk-1(pending) / bk-2(confirmed) / bk-3(done)
     **全部占掉** —— C1 上三个妆位一起变成灰色的「已约」，
     「选这个妆位」一个都点不到，**提审截图 ② 的顾客路径当场断掉**。

     ⇒ 这条理由对**今天**仍然成立（`done` 也算占，是第十五处定死的口径）。
       所以第二十处换掉夹具的时候，同步换了**保证**：
         · 旧：`SLOTS[].busy` 写死两个 false
         · 新：**示例数据保证「默认选中那一场至少 2 个空妆位」**
               （`SCHEDULES` / `SCHEDULES_OTHER` 里那几张单只占掉一个位）
     ⇒ 自测里那条「C1 上永远有点得动的妆位」的断言**换了判据、没删**
       （原先钉「landing 不许 require bookingStore」，现在钉「默认那场至少 2 个空位」）。
       ⛔ 谁要是又想把 `busy` 写回来，先看 landing.js 的 rowsOf() ——
          那一页现在的妆位状态**只认** `BOOKED_STATUS` 一处口径。

   ⚠️ 还有一条也留着：**漫展名必须是自由文本**（红线 3）。
      做成平台维护的枚举字典、或做成「展会页」= 双违规。
      `SCHEDULES` 里那个 `name` 字段就是自由文本，这一条没变。
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   妆娘端的【示例档期】—— 首次进入时由 utils/scheduleStore.js 的 seed()
   写进 storage，让档期列表和预约单的场次筛选条一打开就有东西。
   📌 2026-10-01（第二十处）：它现在**同时**是顾客端 C1 妆位页的数据源
      （`artistStore.schedulesOfArtist('demo')` 读的就是 storage 里这一份）——
      原先 C1 读的是上面那两份已退役的夹具，两套世界故意解耦，现在合流了。
      ⚠️ 合流的直接后果：妆娘改了妆位 / 取消了场次，顾客那一页**立刻**跟着变
         （这正是「真数据」这四个字的意义）。⇒ 改示例数据前想清楚
         「顾客点进 C1 会看到什么」，⛔ 别再往这几场里塞满预约单：
         「默认那一场至少 2 个空妆位」是提审截图 ② 点得动的唯一保证。
   ⚠️ 两场【故意同名不同日】—— 同一个漫展分两天，是真实里最常见的形状，
      也是「场次筛选」必须存在的理由（光看名字分不出是哪天）。
   ⚠️ schedule_id 是手写的固定值（不是 newId() 的 'sched-<时间戳>'），
      因为 mock 预约单要按 id 挂上来。
   ⚠️ 末尾那几位数字是【故意留着的】：比新旧时取 id 末尾的数字来比
      （booking.js 的 idRank），0502/0503 比任何毫秒时间戳都小，
      所以这两场示例档期永远排在妆娘自己建的档期后面。
   ⚠️ lunch 的字段形状必须跟 utils/schedule.js 的 generateSlots() 一模一样，
      尤其是 `min`（午休时长）：档期详情页画那一行浅蓝的午休靠的就是它，
      漏了就是一行「12:00 – 13:00 · undefined 分钟」。
   ════════════════════════════════════════════════════════════════════ */
const demoSlots = (pairs) => pairs.map((p, i) => ({
  seq: i + 1, start: p[0], end: p[1],
  minutes: Number(p[1].slice(0, 2)) * 60 + Number(p[1].slice(3)) -
           (Number(p[0].slice(0, 2)) * 60 + Number(p[0].slice(3))),
  is_break: false, booked: false
}))

/* ════════════════════════════════════════════════════════════════════
   📌 2026-09-30（第二十处）这一份动了两处，都是为了顾客端能真的走通：

   ① **日期改成现算**（`daysFromToday`）。原先写死 `2026-05-02/03`，
      而第二十处那天是 09-30 —— 两场都过去了。见文件顶上 `daysFromToday`
      那段长注释：顾客端一开始「只列今天及以后」，整个妆位页就会变成空的，
      而且不报错。
      ⚠️ `schedule_id` 末尾那几位数字（0502 / 0503）**没动** ——
         它现在只是 `booking.js` 的 idRank 用来排序的一个稳定后缀，
         ⛔ 不再表示日期。改名会让「比 id 末尾数字」那套排到别处去。

   ② **`sched-demo-0502` 从 3 个妆位加到 5 个**。
      🔴 原因是它同时是【demo 的默认场次】（离今天最近的那一场，第二十处定的）
         和【bk-1/2/3 占位的场次】。3 个位全被占 ⇒ 顾客点进 C1 看到的
         是一片灰、一个都点不动 —— 而这一页正是提审截图 ② 的落点。
      加两个位之后：seq 1/2/3 被 bk-2/bk-1/bk-3 占着，**seq 4/5 空着**。
      ⚠️ 「某一场被约满」这个状态没丢 —— 挪到 `sched-demo-0503` 上了
         （它 4 个位被 bk-4/5/6/7 占满），自测 ⑤-C 那条「约满了」空态
         现在拿 0503 来验，判据一个字没改。
   ════════════════════════════════════════════════════════════════════ */
const SCHEDULES = [
  {
    schedule_id: 'sched-demo-0502',
    name: '示例漫展',
    date: daysFromToday(5),
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 5,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20'],
                      ['14:30', '15:50'], ['16:00', '17:20']])
  },
  {
    schedule_id: 'sched-demo-0503',
    name: '示例漫展',
    date: daysFromToday(6),
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 4,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20'], ['14:30', '15:50']])
  }
]

/* ════════════════════════════════════════════════════════════════════
   📌 另外两位妆娘的档期（2026-09-30 第二十处新增）。

   🔴 和上面 `SCHEDULES` 的区别，⛔ 别混：
      · `SCHEDULES`       = **demo 自己的**，会被 scheduleStore.seed() 写进 storage，
                            妆娘端能改能删 —— 所以它是「活的」
      · `SCHEDULES_OTHER` = 另外两位的，**只读、⛔ 从不落 storage**
                            （她们没有妆娘端；这一份只服务顾客端的妆位页）
   ⚠️ 为什么另起一份而不是把三人都塞进 SCHEDULES：
      SCHEDULES 会整份种进【妆娘端】的档期列表 —— 塞进去的话，demo 打开
      「档期」Tab 会看到另外两位妆娘的场次，那是明确错的。
   ⚠️ 每人两场、**同名不同日**（照 demo 那两场的先例）：「场次筛选」存在的
      理由就是光看名字分不出是哪天，一个人只有一场的话那个筛选条只剩一项，
      演示不出它有什么用。
   ⚠️ 每人的【第一场】是离今天最近的那一场 = 顾客进来默认选中的那场。
      它**必须留得出空妆位**（自测钉着「默认那一场至少 2 个空位」）——
      现在每场只被「我约过她」的一张单占掉一个位，剩下的都空着。
   ════════════════════════════════════════════════════════════════════ */
const SCHEDULES_OTHER = [
  {
    schedule_id: 'sched-mian-0701',
    artist_id: 'demo-mian',
    name: '青蓝漫展',
    date: daysFromToday(3),
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20']])
  },
  {
    schedule_id: 'sched-mian-0702',
    artist_id: 'demo-mian',
    name: '青蓝漫展',
    date: daysFromToday(17),
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 4,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20'], ['14:30', '15:50']])
  },
  {
    schedule_id: 'sched-ali-0801',
    artist_id: 'demo-ali',
    name: '星轨展',
    date: daysFromToday(9),
    startTime: '09:30', slotMin: 90, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, start: '12:50', end: '13:50', afterSeq: 2 },
    slots: demoSlots([['09:30', '11:00'], ['11:10', '12:40'], ['14:00', '15:30']])
  },
  {
    schedule_id: 'sched-ali-0802',
    artist_id: 'demo-ali',
    name: '星轨展',
    date: daysFromToday(23),
    startTime: '09:30', slotMin: 90, gapMin: 10, count: 4,
    lunch: { enabled: true, min: 60, start: '12:50', end: '13:50', afterSeq: 2 },
    slots: demoSlots([['09:30', '11:00'], ['11:10', '12:40'],
                      ['14:00', '15:30'], ['15:40', '17:10']])
  }
]

/* 📌 2026-10-01（第二十处）：这里原本是 `const SLOTS = [...]` ——
   C1 落地页那份写死的三个妆位（`demo-s1/s2/s3`，带 `busy`）。
   已随 `SCHEDULE` 一起退役，理由和那条「为什么曾经必须写死 busy」的知识
   都在上面 `SCHEDULE` 那一段的注释里（🔴 那段注释是**刻意留着**的，
   ⛔ 不是没删干净）。 */

/* ════════════════════════════════════════════════════════════════════
   顾客档案层 / 每次层的字段字典。
   妆感有一份**平台预设列表**，M0 就按 15 项权威列表 + 分组折叠。
   ⚠️ 原先这里写的是「（封闭枚举）」—— 第十八处之后**妆师端那一半不再封闭**
      （每组可自填，见下），所以那句话已经不准，故改。
   📌 2026-09-30（第十八处）：这份列表现在【两个端各用一半】——
      · 妆师端 style-edit：当成「接妆风格的预设词表」，而且**每组可自填**
        （自填词只进她自己那条资料，⛔ 不改这张表）
      · 顾客端 booking-form：当成「目标妆感」的 chips（⛔ 不含妆娘的自填词，
        理由写在 booking-form.js 那一段注释里，是一次决定不是漏了）
   ════════════════════════════════════════════════════════════════════ */

/* 档案层 · 眼型（多选 4 项） */
const EYE_TYPES = ['单眼皮', '双眼皮', '内双', '肿眼泡']

/* 档案层 · 肤质（多选 6 项，含敏感肌） */
const SKIN_TYPES = ['干皮', '混干皮', '中性皮', '油皮', '混油皮', '敏感肌']

/* 档案层 · 性别（单选 3 项，加「不便告知」） */
const GENDERS = ['男', '女', '不便告知']

/* 每次层 · 妆感 —— v1.4 §2.2 的 15 项权威列表，按维度分组折叠（§5.7）。
   ⛔ 全站唯一来源：妆师端「接妆风格」的预设词表 和 顾客端「目标妆感」的
      chips 共用这一套（⛔ 不许在别处再抄一份 16 项的列表）。
   📌 原先这里还写着「作品集的妆感标签」——**作品集整个板块已经删掉了**
      （README §4 第十五处），那句话已经不成立，故删。
   ⚠️ 这 16 个词是**平台词表**，⛔ 不因为妆娘能自填就改动它（用户原话：
      「接妆风格**除了我列出的那些选项**…妆娘可以自填选项」）。 */
const STYLE_GROUPS = [
  { group: '妆感质感', items: ['自然感', '建模感', '古早感', '混血感'] },
  { group: '场合',     items: ['日常妆', '正片妆', '展妆','超精妆'] },
  { group: '浓度',     items: ['淡系', '浓系'] },
  { group: '题材',     items: ['蕾系', '成男妆', '古风妆', '韩妆', '日系 cos 妆'] },
  { group: '其他',     items: ['其他'] }
]

/* 每次层 · 另需服务 —— 推荐项来自平台 8 项封闭列表（§6，D-42 扩展）。
   妆娘可再自设自定义项（M0 先不展开）。 */
const EXTRA_SERVICES = [
  { name: '帮戳美瞳',   price: 5,  need_self_supply: true  },
  { name: '胶带提拉',   price: 5,  need_self_supply: false },
  { name: '贴硅胶下巴', price: 10, need_self_supply: true  },
  { name: '贴硅胶鼻',   price: 10, need_self_supply: true  },
  { name: '特殊肤色',   price: 5,  need_self_supply: false },
  { name: '遮眉',       price: 0,  need_self_supply: false },
  { name: '手绘面纹',   price: 0,  need_self_supply: false },
  { name: '贴鼻贴',     price: 0,  need_self_supply: false }
]

/* ════════════════════════════════════════════════════════════════════
   档期模板（schedule_template）—— 妆娘端「记忆」入口（§3.1）。
   slots 是相对时段，不含日期。M0 两条示例。
   ════════════════════════════════════════════════════════════════════ */
const TEMPLATES = [
  {
    template_id: 'tpl-1',
    name: '花瞳漫展常规日',
    slots: [
      { seq: 1, time: '09:00 – 10:20' },
      { seq: 2, time: '10:30 – 11:50' },
      { seq: 3, time: '13:00 – 14:20' }
    ],
    updated: '2026-05-01'
  },
  {
    template_id: 'tpl-2',
    name: '漫展早场紧凑型',
    slots: [
      { seq: 1, time: '08:30 – 09:40' },
      { seq: 2, time: '09:50 – 11:00' },
      { seq: 3, time: '11:10 – 12:20' }
    ],
    updated: '2026-04-28'
  }
]

/* ════════════════════════════════════════════════════════════════════
   预约单（booking_form）—— 妆娘端列表 / 详情用。
   ⚠️ 顾客的档案字段进 booking_form 必须是「快照」，提交那一刻的值（§5.3 / §11）。
   ⚠️ extra_services 必须存快照（含价格），不引用，防妆娘改价影响历史单（§11）。
   ⚠️ contact 字段（微信号 / 紧急联系方式）绝不在列表接口返回，
      只由详情接口校验「请求者是该单化妆师」后单独返回（§11 高风险字段）。
   status: pending(占位待处理) / confirmed(已确认) / done(已完成)
         / cancel_requested(顾客申请取消，等妆娘点头) / rejected / cancelled
   ⚠️ cancel_requested 是【两步】里的第一步：顾客点了申请，妆娘还没表态 ——
      所以妆位【仍然被占着】，要等妆娘同意才释放（见 bookingStore 的 BOOKED_STATUS）。
   ⚠️ 2026-09-30（第十七处）：这一份【仍然】是内存里那一份直接被子改的
      （bookingStore 故意不落 storage，理由见那个文件开头）。妆娘端「代填」
      新建的单也是 push 进这个数组 —— 于是它当场就被 bookedSeqsOfSchedule()
      算成「已占」，档期卡片上的「N 人已预约」也跟着 +1，三处读的是同一个数组。
      ⚠️ 代价：预约单的所有改动都是【会话级】的，重启小程序就回到这个初始状态 ——
         这是 M0 一贯的行为（标记已确认、批量处理、代填都一样），
         ⛔ 不要只让「新增」持久化 —— 那会造出一条新的不对称
         （我改的状态会丢、我新建的单不会丢），比现状更难解释。M1 一起迁云开发。
   ════════════════════════════════════════════════════════════════════ */
const BOOKINGS = [
  {
    booking_id: 'bk-1',
    artist_id: 'demo',
    // ⚠️ 这一单属于哪一场档期 —— 只看 schedule_id，不看名字和日期。
    //    名字+日期是【认不出来】的：同一个漫展分两天、或者两场同名，都会撞。
    schedule_id: 'sched-demo-0502',
    /* 🔴 2026-09-30（第二十处）：`slot_id` 全项目一律是空串，⛔ 别去补一个。
       ——「妆位的身份 = (schedule_id, seq)」这件事本来就定过（自测 :2371 那条
       断言的原话），但顾客端的 C1 之前还挂着一串 `demo-s2` 那样的旧写法：
       它指向的是 `SLOTS` 那份【冻结夹具】，而那份已经退役了。
       留着的代价很具体：点「选这个妆位」跳去填写页，填写页拿 slot_id 回查
       夹具查不到 ⇒ 每一单都被告知「这个妆位已经不在了」——
       **出声了，但那句话是假的**（比不报错更难查）。
       ⇒ C1 改传 `?schedule_id=&seq=`，填写页用 (schedule_id, seq) 现查。
       见 bookingStore.buildBooking 里 `slot_id` 那一段注释。 */
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(5),
    slot_time: '10:30 – 11:50',
    seq: 2,
    created_by: 'user',
    // ── 档案快照 ──
    role: '安琪拉',
    cn: '千夏',
    eye: ['双眼皮', '肿眼泡'],
    skin: ['油皮', '敏感肌'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    // ── 每次填 ──
    styles: ['建模感', '浓系'],
    extra: [{ name: '帮戳美瞳', price: 5, need_self_supply: true }],
    note: '想要清透一点的妆',
    // ── 联系方式（只对化妆师可见）──
    wechat: 'demo_guest',
    phone: '13800000000',
    // ── 状态 ──
    status: 'pending',
    deposit_amount: 50,
    deposit_paid: false,
    created_at: '2026-05-01 20:14'
  },
  {
    booking_id: 'bk-2',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0502',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(5),
    slot_time: '09:00 – 10:20',
    seq: 1,
    created_by: 'artist',
    role: '花火',
    cn: '洛霞',
    eye: ['单眼皮'],
    skin: ['干皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['展妆'],
    extra: [],
    note: '线下口头约好，代填',
    wechat: 'wxid_luoxia',
    phone: '13900000000',
    status: 'confirmed',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-04-30 19:02'
  },
  {
    booking_id: 'bk-3',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0502',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(5),
    slot_time: '13:00 – 14:20',
    seq: 3,
    created_by: 'user',
    role: '芽衣',
    cn: '柚木',
    eye: ['内双'],
    skin: ['中性皮'],
    gender: '不便告知',
    is_minor: false,
    guardian_consent: false,
    styles: ['正片妆', '淡系'],
    extra: [{ name: '贴硅胶鼻', price: 10, need_self_supply: true }],
    note: '',
    wechat: 'demo_yae',
    phone: '13700000000',
    status: 'done',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-05-02 15:40'
  },

  /* ── 下面这几单是给【批量处理 + 场次筛选 + 顾客申请取消】当演示用的
     （2026-09-29 加）─────────────────────────────────────────────────
     批量勾选要看得见「全选 / 取消勾选 / 灰掉的行」这三样，各状态只有一单
     是演示不出来的。所以：
       · 待处理留 2 单（bk-1、bk-6）—— 全选之后能取消掉一单再处理
       · 已确认留 3 单，其中 bk-4 【定金未付】—— 「一键确认」里它必须是灰的
       · bk-7 是【顾客申请取消】—— 妆娘端要能看见那个待处理的红标
     ⚠️ 日期用 2026-05-03（不是 05-02）：换一天才能在「全部」和「某一场」
        之间看出区别 —— 两场各有各的四个状态，这就是筛选条要证明的事。
     ⚠️ bk-7 的 cn 和 bk-1 是【同一个人】（千夏）：搜 CN 要能一次捞出她
        在这两场里的两单，这正是「按 CN 找下单记录」要证明的事。
     字段一个都不能省 —— 详情页会读 extra / note / phone，缺了就是 undefined。 */
  {
    booking_id: 'bk-4',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0503',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(6),
    slot_time: '09:00 – 10:20',
    seq: 1,
    created_by: 'user',
    role: '初音',
    cn: '初七',
    eye: ['双眼皮'],
    skin: ['油皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['展妆'],
    extra: [],
    note: '定金还在微信里没转',
    wechat: 'demo_miku',
    phone: '13600000000',
    status: 'confirmed',
    deposit_amount: 50,
    deposit_paid: false,
    created_at: '2026-05-01 09:30'
  },
  {
    booking_id: 'bk-5',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0503',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(6),
    slot_time: '10:30 – 11:50',
    seq: 2,
    created_by: 'user',
    role: '雷姆',
    cn: '阿蕾',
    eye: ['双眼皮', '下垂眼'],
    skin: ['混合皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['正片妆'],
    extra: [{ name: '帮戳美瞳', price: 5, need_self_supply: true }],
    note: '',
    wechat: 'demo_rem',
    phone: '13500000000',
    status: 'confirmed',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-05-01 11:05'
  },
  {
    booking_id: 'bk-6',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0503',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(6),
    slot_time: '13:00 – 14:20',
    seq: 3,
    created_by: 'user',
    role: '绫波丽',
    cn: '晴子',
    eye: ['内双'],
    skin: ['干皮'],
    gender: '女',
    is_minor: true,
    guardian_consent: true,
    styles: ['淡系'],
    extra: [],
    note: '未成年，已确认监护人同意',
    wechat: 'demo_rei',
    phone: '13400000000',
    status: 'pending',
    deposit_amount: 50,
    deposit_paid: false,
    created_at: '2026-05-01 21:48'
  },
  {
    /* 顾客申请取消（两步里的第一步）。妆娘端「已确认」页里它带一个红标，
       点进详情有两个键：同意取消 / 不同意，继续保留。
       妆位到妆娘点头之前【一直占着】—— 客人只是说想退，还没退成。 */
    booking_id: 'bk-7',
    artist_id: 'demo',
    schedule_id: 'sched-demo-0503',
    slot_id: '',
    event: '示例漫展',
    date: daysFromToday(6),
    slot_time: '14:30 – 15:50',
    seq: 4,
    created_by: 'user',
    role: '巡音',
    cn: '千夏',
    eye: ['双眼皮'],
    skin: ['混干皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['古风妆'],
    extra: [],
    note: '临时有事来不了，想问能不能退',
    wechat: 'demo_natsuko',
    phone: '13300000000',
    status: 'cancel_requested',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-05-02 22:10'
  },

  /* ── 下面两单是【我约过另外两位妆娘】的记录（2026-09-30 第二十处加）
     ────────────────────────────────────────────────────────────────
     🔴 它们存在的**唯一理由**：顾客端那个「我约过的妆娘」列表是**从预约记录
        聚合出来的**（判据 = 我约过谁），不是一份妆娘名册（那是红线 1）。
        所以预置的 3 位**每一位都必须有一条「我约过她」的单** ——
        ⛔ 少一条就会出现「列表里有她、我却从没约过」的行，
        那一行看起来就是人肉目录。自测里有一条断言专门扫这个自洽性。

     🔴 `artist_id` 在这里**不是 'demo'** —— 全项目第一次出现这种情况，
        所以下面这件事必须写下来：
          妆娘端的预约单列表（pages/booking/booking.js 的 buildList）
          选「全部」场次时【不按场次滤】，只按四个状态 Tab 滤。
          它以前不需要认人 —— 因为以前只有一个妆娘。
        ⇒ 这两单要是直接塞进 getBookings() 的射程，demo 打开「已确认」
          会看见【青蓝漫展 · 别人的客人】。所以 bookingStore 补了一个
          `bookingsOfArtist()`，妆娘端改走它（判据 = 这一单的 artist_id）。
        ⚠️ 这两单仍然是真单：顾客端的「我的预约」看得到（created_by='user'）、
           她们那两场档期的妆位也真的被占掉（bookedSeqsOfSchedule）。

     ⚠️ cn 故意和 bk-1 / bk-7 一样是「千夏」：这样「我约过的妆娘」读起来
        是【同一个人】的三条记录，而不是三个人的。演示数据也得自洽。
     ⚠️ 状态分别是 confirmed / done —— 顺带钉住「done 也占妆位」这条口径
        （第十五处定的：做完了不能当空位再约给别人）。 */
  {
    booking_id: 'bk-8',
    artist_id: 'demo-mian',
    schedule_id: 'sched-mian-0701',
    slot_id: '',
    event: '青蓝漫展',
    date: daysFromToday(3),
    slot_time: '09:00 – 10:20',
    seq: 1,
    created_by: 'user',
    role: '八重神子',
    cn: '千夏',
    eye: ['双眼皮'],
    skin: ['混干皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['古风妆'],
    extra: [],
    note: '',
    wechat: 'demo_guest',
    phone: '13800000000',
    status: 'confirmed',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-05-01 18:20'
  },
  {
    booking_id: 'bk-9',
    artist_id: 'demo-ali',
    schedule_id: 'sched-ali-0801',
    slot_id: '',
    event: '星轨展',
    date: daysFromToday(9),
    slot_time: '11:10 – 12:40',
    seq: 2,
    created_by: 'user',
    role: '绫波丽',
    cn: '千夏',
    eye: ['内双'],
    skin: ['中性皮'],
    gender: '女',
    is_minor: false,
    guardian_consent: false,
    styles: ['自然感', '淡系'],
    extra: [],
    note: '',
    wechat: 'demo_guest',
    phone: '13800000000',
    status: 'done',
    deposit_amount: 50,
    deposit_paid: true,
    created_at: '2026-04-28 12:05'
  }
]

module.exports = {
  ARTIST_PUBLIC, ARTIST_DIRECTORY, ARTIST_CONTACT,
  SCHEDULES, SCHEDULES_OTHER,
  EYE_TYPES, SKIN_TYPES, GENDERS,
  STYLE_GROUPS, EXTRA_SERVICES,
  TEMPLATES, BOOKINGS
}
