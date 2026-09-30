/**
 * M0 假数据 —— 全部是「一眼就是示例」的数据。
 *
 * ⛔ 不要换成真人照片或真实化妆师信息：审核期是公开可查的（红线 9）。
 * M1 这整个文件会被云开发的 artists / schedules / slots 取代。
 */

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

/* 🔒 只给 utils/contact.js 用。
   任何页面 / 组件直接 require 这个对象都是错的 —— 绕过了校验出口。 */
const ARTIST_CONTACT = {
  artist_id: 'demo',
  wechat_id: 'demo_makeup',
  // 对应「设置 → 在分享页展示我的微信号」这个开关。
  // 关掉时 C1 上整个微信号那一行都不渲染（不是变灰，是不出现）。
  show_wechat: true
}

const SCHEDULE = {
  schedule_id: 'demo-sched-1',
  // ⚠️ 红线 3：漫展名必须是自由文本。
  //    做成平台维护的枚举字典、或做成「展会页」= 双违规。
  name: '示例漫展',
  date: '2026-05-02'
}

/* ════════════════════════════════════════════════════════════════════
   妆娘端的【示例档期】—— 首次进入时由 utils/scheduleStore.js 的 seed()
   写进 storage，让档期列表和预约单的场次筛选条一打开就有东西。
   ⚠️ 它和上面的 SCHEDULE / SLOTS 不是同一份东西：
      SCHEDULE 是【顾客端 C1 落地页】的示例（一个妆娘的一场），
      SCHEDULES 是【妆娘端档期列表】的示例（她自己排好的几场）。
      M0 两份假数据各自独立；M1 都由云开发返回，这份就没了。
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

const SCHEDULES = [
  {
    schedule_id: 'sched-demo-0502',
    name: '示例漫展',
    date: '2026-05-02',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20']])
  },
  {
    schedule_id: 'sched-demo-0503',
    name: '示例漫展',
    date: '2026-05-03',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 4,
    lunch: { enabled: true, min: 60, start: '12:00', end: '13:00', afterSeq: 2 },
    slots: demoSlots([['09:00', '10:20'], ['10:30', '11:50'], ['13:00', '14:20'], ['14:30', '15:50']])
  }
]

/* ════════════════════════════════════════════════════════════════════
   🔴🔴 `busy` 是【写死的演示夹具】，⛔ 不是从 BOOKINGS 推出来的。

   2026-09-30（第十七处）把这句话纠正过来了 —— 原先这里写着「busy 的判定 =
   该妆位存在一条 status ∈ {pending, confirmed} 的预约单」，**那句话是假的**，
   而且是个陷阱：真按 bookedSeqsOfSchedule() 去推，`sched-demo-0502` 的
   第 1/2/3 位会被 bk-2(confirmed) / bk-1(pending) / bk-3(done) **全部占掉**，
   C1 上三个妆位一起变成灰色的「已约」，「选这个妆位」一个都点不到 ——
   **提审截图 ② 的顾客路径当场断掉**。

   ⇒ 这两套世界是【故意解耦】的：
        · `SLOTS[].busy`            = 冻结的演示夹具（C1 落地页，提审用）
        · `mock/data.js 的 BOOKINGS` = 妆娘端真实的预约单库（会被改、会新增）
      代填建的单只占【妆娘端】的妆位，**不会也不该**反映到 C1 上。
   ⇒ 自测里有一条断言专门钉死「pages/landing 不许 require bookingStore」，
      ⛔ 别去「顺手修一致」，那会把提审路径修没。 */
const SLOTS = [
  { slot_id: 'demo-s1', seq: 1, time: '09:00 – 10:20', busy: true  },
  { slot_id: 'demo-s2', seq: 2, time: '10:30 – 11:50', busy: false },
  { slot_id: 'demo-s3', seq: 3, time: '13:00 – 14:20', busy: false }
]

/* ════════════════════════════════════════════════════════════════════
   顾客档案层 / 每次层的字段字典 —— 方案草案 §5。
   妆感有一份**平台预设列表**，M0 就按 v1.4 §2.2 的 15 项权威列表 +
   分组折叠（§5.7）。
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
    slot_id: 'demo-s2',
    event: '示例漫展',
    date: '2026-05-02',
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
    slot_id: 'demo-s1',
    event: '示例漫展',
    date: '2026-05-02',
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
    slot_id: 'demo-s3',
    event: '示例漫展',
    date: '2026-05-02',
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
    slot_id: 'demo-s1',
    event: '示例漫展',
    date: '2026-05-03',
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
    slot_id: 'demo-s2',
    event: '示例漫展',
    date: '2026-05-03',
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
    slot_id: 'demo-s3',
    event: '示例漫展',
    date: '2026-05-03',
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
    slot_id: 'demo-s4',
    event: '示例漫展',
    date: '2026-05-03',
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
  }
]

module.exports = {
  ARTIST_PUBLIC, ARTIST_CONTACT,
  SCHEDULE, SLOTS, SCHEDULES,
  EYE_TYPES, SKIN_TYPES, GENDERS,
  STYLE_GROUPS, EXTRA_SERVICES,
  TEMPLATES, BOOKINGS
}
