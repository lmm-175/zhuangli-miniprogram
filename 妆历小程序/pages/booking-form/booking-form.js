const {
  EYE_TYPES, SKIN_TYPES, GENDERS,
  STYLE_GROUPS, EXTRA_SERVICES
} = require('../../mock/data')
const { getSchedules, getSchedule } = require('../../utils/scheduleStore')
/* 🔴 2026-10-01（第二十二处）：顾客那一支找场次必须走 artistStore 的
   `scheduleById`，⛔ 不是上面那个 `getSchedule`（它只看 storage）。
   两个入口服务的是**两个不同的角色**，⛔ 别互换：
     · 妆师端「代填」→ `getSchedule`（她自己的档期本 = storage），
       她只能给【她自己】的场次代填；
     · 顾客自填     → `scheduleById`（顾客端那两个数据源的并集），
       因为顾客进来的那一页可能是【任意一位】妆娘的。
   混用的后果就是这一处要修的那个 bug（见下面顾客那一支的注释）。 */
const { scheduleById } = require('../../utils/artistStore')
const { bookedSeqsOfSchedule, buildBooking, addBooking } = require('../../utils/bookingStore')
const { TOAST } = require('../../utils/toast')

const initToggle = (arr) => arr.map((name) => ({ name, on: false }))
const onNames = (arr) => (arr || []).filter((x) => x.on).map((x) => x.name)

/* 妆位时段的写法：`10:30 – 11:50`。
   🔴 中间那个字符是 **`–` U+2013（短破折号）**，⛔ 不是连字符 `-`。
      它必须跟 mock/data.js 里那 7 张单的 `slot_time`【逐字一致】——
      booking-detail 是把这个字符串【直接印出来】的，两边用不同的字符
      就会在同一屏上出现「10:30 – 11:50」和「10:30 - 11:50」两种写法，
      而那种差异没人会当成 bug 报上来。
      ⚠️ 这里照 mock 的写法用**字面量**（全项目 7 张单都是这么写的，转义反而
         成了唯一一处不一致）。真正的保护不是转义，是**自测里那条断言**：
         `slotTimeOf(slot)` 必须等于 mock 里同一位置的 `slot_time` 字符串 ——
         谁把那个字打错了，测试当场红。 */
function slotTimeOf(slot) {
  return String(slot.start) + ' – ' + String(slot.end)
}

/* ══ 妆师端「代填」的场次下拉 ═════════════════════════════════════════
   2026-09-30（第十七处）新增。用户原话：
     「预约界面的代填，代填的妆位可以选择已建好的漫展」

   🔴 修的是这个真 bug：原先 `onLoad` 里是
        `SLOTS.filter(...)[0] || SLOTS[1]`
      而妆师端进来时**根本不带 slot_id**（booking.js 的 goNewArtistForm
      只传 `?mode=artist`）→ 于是**静默**回落到 `SLOTS[1]`，
      那是**顾客端 C1 落地页的示例妆位**（漫展名写死「示例漫展」，id 形如 demo-s2）。
      结果：妆娘线下谈好一单，代填出来的单挂在一场她根本不存在的漫展上，
      而且一点提示都没有。自测里有一条源码级断言钉死 `SLOTS[1]` 不再出现。

   ⚠️ 这个下拉【不共用 booking.js 的 schedChips()】，两条理由：
      ① 那个函数是 module-private（booking.js 里没 export，也不该 export
         —— 它是那个页面的排版细节，不是一份通用数据）；
      ② 它带「全部」这一项、还要把「已处理完」的场次沉到底下。
         代填列表【不能有「全部」】—— 预约单必须明确落在一场档期上
         （belongsToSchedule 只认 schedule_id，没有「全部」这个 id）。
         排序理由也完全不同：那边是「她正在处理哪一场」，这边是「她刚谈完哪一场」。
      ⇒ 各自写一份，服务的事不一样。⛔ 别为了「少写十行」硬合并。

   ⚠️ 按【日期升序】排（不是离今天最近）：代填多半就是刚谈完的那一场，
      按日期从早到晚最符合「排班表」的直觉。 */
function schedOptionsOf() {
  return getSchedules()
    .slice()
    .sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''))
    })
    .map(function (s) {
      return {
        value: s.schedule_id,
        // `示例漫展 · 05-02`，跟 booking.js 的 chipLabel 同一个写法：
        // ⛔ 不带年份（同一个妆娘的档期绝大概率在同一年），但日期必须带着
        //    —— 同一个漫展分两天，光看名字分不出来。
        label: s.name + (s.date ? ' · ' + String(s.date).slice(5) : '')
      }
    })
}

/* ══ 这一场里【还能选】的妆位 ═════════════════════════════════════════
   🔴 用户 2026-09-30 定的是「已被预约的妆位**直接从下拉里去掉**」
      （不列出来、也不标「已被约」）。
   🔴 「哪些妆位能选」和「提交时放不放行」问的是**同一个函数**（规矩 14）——
      两处都调 bookedSeqsOfSchedule()。⛔ 这一页里不许再出现手写的
      `status === 'pending' || status === 'confirmed'` 那种枚举：
      写第二份的那天，就是「下拉里能选、提交却被拦」或反过来的那天。
   ⚠️ 午休那一行（`is_break`）不是妆位，⛔ 不能出现在下拉里。
   ⚠️ `bookedSeqsOfSchedule` 的口径包含 done / cancel_requested
      （见 bookingStore 的 BOOKED_STATUS）—— 已完成的妆位照样是「有人了」，
      申请取消但妆娘没点头的也还占着。这里一个字都不用再判。 */
function slotOptionsOf(s) {
  if (!s) return []
  const taken = bookedSeqsOfSchedule(s)
  return (s.slots || [])
    .filter(function (x) { return !x.is_break && taken.indexOf(x.seq) < 0 })
    .map(function (x) {
      return {
        value: x.seq,
        label: '第 ' + x.seq + ' 位 · ' + slotTimeOf(x)
      }
    })
}

/* ══ 「可选妆位是空的」——必须说清是**哪一种**空 ═══════════════════════
   🔴 这是决定 6（把已订的妆位藏起来）能不能站住的**唯一支撑**。
      藏了「已订」那一行，她就看不见「这一天不是空着的」；于是只剩三句
      长得一模一样的话：「这一场还没排妆位」「这一场的妆位都约满了」。
      ⛔ 合并成一句「没有可选的妆位」就是把三种原因压成一种表现 ——
         她会以为是自己档期建错了，而不是「这一场满了，换一场」。
      （README 规矩 28 就是这一条。）
   ⚠️ 只在【选了场次之后】调用。没有场次时那一格说的是「请先选场次」，
      跟这里无关。 */
function emptyReasonOf(s) {
  if (!s) return ''
  const real = (s.slots || []).filter(function (x) { return !x.is_break })
  if (!real.length) return '这一场还没排妆位'
  return '这一场的妆位都约满了'
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    slotText: '',
    mode: 'user',              // 'user' 顾客自填 | 'artist' 妆师代填
    title: '填写预约单',
    // cn 排最前 —— 它是「这个人是谁」，其余都是她的条件（2026-09-29 加）
    form: { cn: '', role: '', wechat: '', phone: '', note: '' },
    // ── 档案层（多选 / 单选）──
    eyeTypes: [],
    skinTypes: [],
    genders: [],
    isMinor: false,
    guardian: false,
    // ── 每次层 ──
    styleGroups: [],
    extras: [],
    // ── 妆师代填 · 妆位选择（2026-09-30 第十七处新增）──
    // ⚠️ 顾客自填（mode==='user'）**完全不碰**这几项：妆位是她在 C1 上
    //    自己点「选这个妆位」定下来的，进来只读、不给改。
    schedOptions: [], schedLabels: [], schedIdx: 0, pickedSched: '',
    slotOptions: [], slotLabels: [], slotIdx: 0, pickedSeq: 0,
    slotEmptyText: '',
    // 一场档期都没建过 —— 整块换成引导卡（C1 分支）
    noSchedule: false,
    // ⚠️ 顾客自填专用：?slot_id= 传进来的那个妆位没找到。
    //    加这一条是因为**那个静默回落 `|| SLOTS[1]` 被删掉了**，
    //    删了就必须有人接住「没找到」这件事（规矩 22：每个分支都要出声）。
    //    ⚠️ 正常路径走不到这儿（C1 只给真妆位渲染「选这个妆位」），
    //    兜的是「分享链接过期 / 夹具改了」那种脏输入。
    slotMissing: false
  },

  onLoad(options) {
    const mode = options.mode === 'artist' ? 'artist' : 'user'

    // 示例预填（跟 mock 预约单 bk-1 对齐，审核员一键可提交）。
    // 真字段，可改可清空。
    const eyeTypes = initToggle(EYE_TYPES)
    const skinTypes = initToggle(SKIN_TYPES)
    const genders = initToggle(GENDERS)
    const mark = (arr, keys) => arr.forEach((x) => { if (keys.indexOf(x.name) >= 0) x.on = true })
    mark(eyeTypes, ['双眼皮', '肿眼泡'])
    mark(skinTypes, ['油皮', '敏感肌'])
    mark(genders, ['女'])

    /* 🔴 2026-09-30（第十八处）：妆娘能自填接妆风格词了，而这里的「目标妆感」
       **只有平台预设那 16 个**，妆娘自填的词**不会**出现在顾客这一屏上。
       这是一次【决定】，不是漏了 —— 用户原话「用不着顾客搜，顾客搜不着就
       搜不着吧」。⛔ 别"顺手补上"：
         · 补上就得让顾客端读妆娘那条 storage（M1 还要读云端 artists 集合），
           而这一页是【顾客端】，顾客看到的应该是他自己要什么，不是她能接什么；
         · 更要命的是它会把 C1/C2 那条提审路径变成「必须先有妆娘资料」。
       ⚠️ 妆师端代填（mode === 'artist'）**也**用这一份 —— 代填出来的单子
          记的是"客人想要的妆感"，所以同样只认预设词表，⛔ 不因为她自填过
          就多出几项。 */
    const styleGroups = STYLE_GROUPS.map((g) => ({
      group: g.group,
      items: g.items.map((name) => ({ name, on: false }))
    }))
    /* 预选两项目标妆感：第 1 组和第 3 组的**第 1 项**。
       🔴 2026-09-30 核对：这条注释原先写的是「预选（建模感 / 浓系）」——
          **那句话是错的**。`items[0]` 取到的是 **自然感**（妆感质感组第 1 项）
          和 **淡系**（浓度组第 1 项）。上面那句「跟 mock 预约单 bk-1 对齐」
          也对不上：bk-1 的 styles 是 ['建模感', '浓系']。
       ⚠️ 这一轮**没有动这个行为** —— 它是顾客端填写页的预填，
          而用户 2026-09-29 说过「我目前只查妆娘端的问题，等会查用户端的」。
          所以这里只把话说对、并在自测里把**当前真实取值**钉住
          （自然感 / 淡系），⛔ 不是我顺手改成 bk-1 那两项。
          等查用户端时再定：到底该预选哪两项。
       ⛔ 别把这段注释改回「建模感 / 浓系」—— 那是第二次写错同一句话。 */
    if (styleGroups[0]) styleGroups[0].items[0].on = true
    if (styleGroups[2]) styleGroups[2].items[0].on = true

    const patch = {
      mode,
      title: mode === 'artist' ? '新建预约单（代填）' : '填写预约单',
      form: {
        cn: mode === 'artist' ? '' : '千夏',
        role: mode === 'artist' ? '' : '示例角色',
        wechat: 'demo_guest', phone: '', note: ''
      },
      eyeTypes, skinTypes, genders, styleGroups,
      extras: EXTRA_SERVICES.map((s) => ({ ...s, on: false }))
    }

    if (mode === 'artist') {
      /* 代填：**不预选任何妆位**。
         ⚠️ 她这一单是给哪个客人、落在哪一场，只有她知道 —— 预选一个
            「看起来最像」的，就是又一次替她做决定，而且错了她多半不会发现
            （单子长得都差不多）。卡片上先写「请选择场次」。 */
      const sOpts = schedOptionsOf()
      patch.schedOptions = sOpts
      patch.schedLabels = sOpts.map((x) => x.label)
      patch.noSchedule = !sOpts.length
    } else {
      /* 🔴 2026-10-01（第二十处第 ⑥ 步）：顾客自填这一支，妆位身份从
         `?slot_id=` 换成 `?schedule_id=&seq=`。
         妆位的身份**一直是** `(schedule_id, seq)` —— `slot_id` 只是
         mock 里那个冻结夹具（`SLOTS`）的字段，夹具退役之后
         `buildBooking()` 里的 `slot_id` 也一直是空串。
         ⚠️ 和 `pages/landing/landing.js` 的 `pickSlot` 是【同一步】改的：
            只改一边的话，每一个选完妆位进来的顾客看到的都是下面那句
            「这个妆位已经不在了」—— 出声了，但说的是错话，比静默更糟。
         ⚠️ 下面 `slotMissing` 那两支兜底一个字没改，判据照旧：查不到就出声，
            ⛔ 不许挑一个顶上（规矩 22）。

         🔴 2026-10-01（第二十二处）**这里原来是 `getSchedule(...)`，是个真 bug**：
            那个函数只看 storage（妆师端自己的档期本），而顾客这一页可能是
            **任意一位**妆娘的 —— 另外两位的场次住在 `SCHEDULES_OTHER` 这个
            只读夹具里、⛔ 从不落 storage。
            ⇒ 顾客从「我约过的妆娘」点进她们任何一场，**每一个**妆位点进来
              都显示「这个妆位已经不在了」。它**出声了**，但那句话是假的：
              妆位好端端在那儿。查了两轮都往"事件绑定"上找，就是因为它不报错。
            改法 = 走 `artistStore.scheduleById`（顾客端两个数据源的并集，
            和 C1 上 `schedulesOfArtist` 出来的那一份同源）。⛔ 别改回 getSchedule。
            ⚠️ 自测那边原先只喂 `sched-demo-0502`（storage 里那场），所以
               **一路绿着放过了**；本轮补的那条是把三位妆娘各走一遍整条路。 */
      const s = scheduleById(options.schedule_id || '')
      const seq = Number(options.seq || 0)
      /* 🔴 2026-10-01（第二十三处）：把「这一单挂在哪」记在**实例**上 ——
         提交时要用它建单。⛔ 不进 data：这几样界面一个都不画。
         ⚠️ `artist_id` 由 C1 的 pickSlot 带过来。缺省 'demo' 只为兼容
            老分享卡片；⛔ 别把它当成常态（见 landing.js pickSlot 的注释）。 */
      this.artistId = options.artist_id || 'demo'
      this.schedId = options.schedule_id || ''
      this.seq = seq
      const slot = s ? (s.slots || []).filter((x) => x.seq === seq)[0] : null
      if (slot) {
        patch.slotText = s.name + ' · 第 ' + slot.seq + ' 位 · ' + slotTimeOf(slot)
      } else {
        patch.slotMissing = true
        patch.slotText = '这个妆位已经不在了'
      }
    }

    this.setData(patch)
  },

  /* 选了场次 → 重算妆位下拉，并把上一次选的妆位**清掉**。
     ⚠️ 必须清：妆位序号是**每一场内部**的（`seq` 只在自己那一场里唯一），
        换了场次还留着上面那个 seq，提交出来的单会挂到新场次的同一个序号上
        —— 那是「妆娘给 A 场约了 3 号位，结果占住了 B 场的 3 号位」，
        而且下拉里看着还挺对。 */
  pickSched(e) {
    const i = Number(e.detail.value)
    const opt = this.data.schedOptions[i]
    if (!opt) return
    const s = getSchedule(opt.value)
    const sOpts = slotOptionsOf(s)
    this.setData({
      schedIdx: i,
      pickedSched: opt.value,
      slotOptions: sOpts,
      slotLabels: sOpts.map((x) => x.label),
      slotIdx: 0,
      pickedSeq: 0,
      slotEmptyText: sOpts.length ? '' : emptyReasonOf(s)
    })
  },

  pickSlot(e) {
    const i = Number(e.detail.value)
    const opt = this.data.slotOptions[i]
    if (!opt) return
    this.setData({ slotIdx: i, pickedSeq: opt.value })
  },

  /* C1 分支的落点：一场档期都没建过 → 引导她去建档期。
     落点是**真落点**（switchTab 到档期页），⛔ 不是弹个 toast 了事。 */
  goSchedule() {
    wx.switchTab({ url: '/pages/schedule/schedule' })
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value })
  },

  toggleMulti(e) {
    const key = e.currentTarget.dataset.k   // eyeTypes / skinTypes / styleGroups / extras
    const i = e.currentTarget.dataset.i
    const j = e.currentTarget.dataset.j
    if (key === 'styleGroups') {
      this.setData({ ['styleGroups[' + i + '].items[' + j + '].on']: !this.data.styleGroups[i].items[j].on })
    } else {
      this.setData({ [key + '[' + i + '].on']: !this.data[key][i].on })
    }
  },

  selectSingle(e) {
    const i = e.currentTarget.dataset.i
    const arr = this.data.genders.map((g, idx) => ({ name: g.name, on: idx === i }))
    this.setData({ genders: arr })
  },

  toggleMinor() {
    this.setData({ isMinor: !this.data.isMinor })
  },

  toggleGuardian() {
    this.setData({ guardian: !this.data.guardian })
  },

  /**
   * 提交。
   * M0 是纯前端假成功：给反馈 + 离开本页。
   * ⚠️ 不能写「功能开发中」那类文案（红线 10）。
   * M1 若改成真写库：角色名 / 备注就是落库的 UGC，
   *   按微信要求要先过 security.msgSecCheck，否则审核不过。
   */
  onSubmit() {
    const f = this.data.form
    /* 顾客那一支在这里查出「这一场 + 这一个妆位」，下面建单时用它。
       ⚠️ 声明在外面是因为建单那段在两次校验之后 —— 中间不想再查一遍。 */
    let gS = null
    let gSlot = null

    /* ══ 妆师端「代填」：妆位相关的两道闸，排在【最前面】══════════════════
       🔴 为什么排最前：她点「提交」时如果妆位还没选，那是最该先说的事 ——
          妆位是这张单的**落点**，落点没定，填了多少 CN 都是白填。
          （排在 CN 后面的话，她会先被要求补 CN，补完再被告知「先选妆位」，
            等于白跑一趟 —— 这跟 2026-09-29 把 CN 单独拎出来是同一条道理。）
       ⚠️ 顾客自填（mode==='user'）**不进这两道**：她的妆位在 C1 上就定好了。 */
    if (this.data.mode === 'artist') {
      if (this.data.noSchedule) {
        wx.showToast({ title: TOAST.NO_SCHEDULE_YET, icon: 'none', duration: 1800 })
        return
      }
      if (!this.data.pickedSched) {
        wx.showToast({ title: TOAST.NEED_SCHEDULE, icon: 'none', duration: 1500 })
        return
      }
      if (!this.data.pickedSeq) {
        wx.showToast({ title: TOAST.NEED_SLOT, icon: 'none', duration: 1500 })
        return
      }
      /* 🔴 并发重查（规矩 14）：下拉是**打开表单那一刻**算出来的，
         她填完 CN/角色/微信号再点提交，中间可能已经有人约走了这个妆位。
         ⛔ 这里必须再问一遍 bookedSeqsOfSchedule —— 跟上面算下拉用的是
            **同一个函数**，所以两边永远不会各说各话。
         ⚠️ 拦下之后要**就地重算下拉**，不然下拉里还挂着那个已经被约走的
            妆位，她再点一次还是同一句话，看着就像按钮坏了。 */
      const s = getSchedule(this.data.pickedSched)
      if (!s) {
        // D2：这一场在别处被取消了（软删除）→ 清空选择，重新选
        this.setData({
          pickedSched: '', pickedSeq: 0, schedIdx: 0,
          slotOptions: [], slotLabels: [], slotIdx: 0, slotEmptyText: ''
        })
        wx.showToast({ title: TOAST.SCHEDULE_GONE, icon: 'none', duration: 1800 })
        return
      }
      if (bookedSeqsOfSchedule(s).indexOf(this.data.pickedSeq) >= 0) {
        const sOpts = slotOptionsOf(s)
        this.setData({
          slotOptions: sOpts,
          slotLabels: sOpts.map((x) => x.label),
          slotIdx: 0,
          pickedSeq: 0,
          slotEmptyText: sOpts.length ? '' : emptyReasonOf(s)
        })
        wx.showToast({ title: TOAST.SLOT_TAKEN, icon: 'none', duration: 1800 })
        return
      }
    } else if (this.data.slotMissing) {
      /* D3（顾客自填）：`?slot_id=` 那个妆位没找到。
         ⚠️ 这一支是**删掉静默回落 `|| SLOTS[1]` 之后必须补上**的兜底
            （规矩 22：每个分支都要出声）。⛔ 不许改回「随便挑一个顶上」——
            那正是这一轮修掉的那个 bug。 */
      wx.showToast({ title: '这个妆位已经不在了，请从分享页重新选', icon: 'none', duration: 1800 })
      return
    } else {
      /* 🔴 2026-10-01（第二十三处）：顾客这一支也要**并发重查**（规矩 14：
         挑选时和提交时必须同一个判据）。
         ⚠️ 这一支原先**一条都没有** —— 妆师端那两道闸一直在，顾客这边是空的。
            少了它，「同一位被另一个客人（或同一个人点两次）约走」是必然的。
         ⚠️ 顺序照妆师端：**先看这一场还在不在，再看妆位有没有人** ——
            这两句说的是两件事，先说哪句决定他被要求先做什么。 */
      const sc = scheduleById(this.schedId)
      const sl = sc ? (sc.slots || []).filter((x) => x.seq === this.seq)[0] : null
      if (!sc || !sl) {
        this.setData({ slotMissing: true, slotText: '这个妆位已经不在了' })
        wx.showToast({ title: '这个妆位已经不在了，请从分享页重新选', icon: 'none', duration: 1800 })
        return
      }
      if (bookedSeqsOfSchedule(sc).indexOf(this.seq) >= 0) {
        this.setData({ slotMissing: true, slotText: '这个妆位已经被预订了' })
        wx.showToast({ title: TOAST.SLOT_TAKEN, icon: 'none', duration: 1800 })
        return
      }
      gS = sc
      gSlot = sl
    }

    /* ⚠️ CN 单独报一次，不并进下面那句「请填写角色名和微信号」（2026-09-29 加）：
       它是妆娘认人的唯一凭据，缺了整张单一文不值 —— 并在一起报的话，
       用户会以为「那我一并补上就行」，而不是「这个最要紧」。
       ⚠️ 顺序也是 CN 在先：它决定提示先说哪一个。 */
    if (!f.cn) {
      wx.showToast({ title: TOAST.NEED_CN, icon: 'none', duration: 1800 })
      return
    }
    if (!f.role || !f.wechat) {
      wx.showToast({ title: TOAST.NEED_ROLE_AND_WECHAT, icon: 'none', duration: 1500 })
      return
    }
    // §5.6：未成年 → 必勾「已得到监护人允许」，否则不能提交
    if (this.data.isMinor && !this.data.guardian) {
      wx.showToast({ title: TOAST.NEED_GUARDIAN, icon: 'none', duration: 1800 })
      return
    }

    /* ── 订阅消息位置和时机就留在这里 ── M0 不实现，M1 插入
         wx.requestSubscribeMessage({ tmplIds: ['<预约提醒模板 ID>'] })
           .catch(() => {})   // 43101 = 额度耗尽，属正常，不阻断提交 */

    /* ══ 妆师端「代填」：真生成一张单，真占上妆位 ═══════════════════════
       🔴 用户 2026-09-30 定的两条：
          ④ 代填**真生成单、真占妆位**（不是只弹个 toast）
          ⑦ 生成的单**直接是 `confirmed`**（不是 pending）
       ⚠️ `confirmed` 会自然落进「已确认」Tab 的批量键范围内
          （batchButtonsOf('confirmed') = 「定金一键已支付」+「一键确认」）——
          这是**想要的**：线下谈好的单本来就是谈成了的，她还能批量往前推。
       ⚠️ `deposit_paid: false` + `deposit_amount: 0`：让「定金一键已支付」
          有活干，而 ¥0 是「没谈定金」的诚实表示（⛔ 不许瞎填一个 50）。
       🔴 `addBooking` 之后，这一场卡片上的「N 人已预约」和挡住取消的那句话
          立刻 +1 —— 因为两者都走 bookingStore.blockingBookings()，
          而它走 getBookings() 这个唯一的读入口。⛔ 不许在这儿另算一遍张数。
       ⚠️ 妆位身份 = (schedule_id, seq)，**没有 slot_id**（那是顾客端
          C1 夹具才有的东西）。buildBooking 里会把 slot_id 留成空串。 */
    /* 两个角色**共用**的那几项（妆感 / 角色 / 联系方式 / 未成年），一模一样。
       ⚠️ 抽出来不是为整洁：两处各抄一份的话，以后加一个字段只改了一边，
          就会出现「顾客点的妆感在详情页是空的」—— 而那种空白跟「他没选」
          长得一模一样，没人会当成 bug 来报。 */
    const common = {
      role: f.role,
      cn: f.cn,
      eye: onNames(this.data.eyeTypes),
      skin: onNames(this.data.skinTypes),
      gender: (this.data.genders.filter((g) => g.on)[0] || {}).name || '',
      is_minor: this.data.isMinor,
      guardian_consent: this.data.guardian,
      styles: this.data.styleGroups.reduce((acc, g) => acc.concat(onNames(g.items)), []),
      extra: this.data.extras.filter((x) => x.on)
        .map((x) => ({ name: x.name, price: x.price, need_self_supply: x.need_self_supply })),
      note: f.note,
      wechat: f.wechat,
      phone: f.phone
    }

    if (this.data.mode === 'artist') {
      const s = getSchedule(this.data.pickedSched)
      const slot = (s.slots || []).filter((x) => x.seq === this.data.pickedSeq)[0]
      addBooking(buildBooking({
        ...common,
        artist_id: 'demo',
        schedule_id: s.schedule_id,
        event: s.name,
        date: s.date,
        slot_time: slotTimeOf(slot),
        seq: slot.seq,
        created_by: 'artist',
        status: 'confirmed',
        deposit_paid: false
      }))
    } else {
      /* 🔴 2026-10-01（第二十三处）：**顾客自填也要真建一张单。**
         原先这一整块被包在 `mode === 'artist'` 里 —— 顾客那一边提交只弹了
         一句 toast，一条记录都没有。后果就是用户报的那句原话：
         「约完了这个妆位还可以再约，也没有变灰」。
         ⚠️ 为什么建了单就会变灰：C1 那一行的被占判据是
            `bookedSeqsOfSchedule()`，它读的就是这个数组 —— 没有单，
            那个位就永远是「可约」。
         ⚠️ `created_by: 'user'` + `status: 'pending'` 一个字都不能改：
            顾客端「我的预约」和「我约过的妆娘」两层都按 `created_by` 认人
            （改一个字，他刚提交的这张单当场从自己的列表里消失）。
            M1 上云之后 `status` 就是审核员唯一能看见的处理状态。
         ⚠️ `artist_id` 用 C1 带过来的**那一位**，⛔ 不许兜底成 'demo'
            （在别人页面上下单、单子记到 demo 名下，见 onLoad 那段注释）。 */
      addBooking(buildBooking({
        ...common,
        artist_id: this.artistId,
        schedule_id: gS.schedule_id,
        event: gS.name,
        date: gS.date,
        slot_time: slotTimeOf(gSlot),
        seq: gSlot.seq,
        created_by: 'user',
        status: 'pending',
        deposit_paid: false
      }))
    }

    wx.showToast({
      title: this.data.mode === 'artist' ? TOAST.BOOKING_FILLED : TOAST.BOOKING_SUBMITTED,
      icon: 'none',
      duration: 1800
    })
    setTimeout(() => {
      if (this.data.mode === 'artist') {
        // 妆师代填完 → 回到妆师端预约单列表
        wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/booking/booking' }) } })
      } else {
        /* 顾客填完 → 我的预约（约妆端第 2 格）。
           🔴 2026-10-01（第二十一处第二轮）：原来是 `redirectTo` —— 那一页
              **升成 tab 页之后，`redirectTo` 会静默失败**（不报错、不跳转、
              屏幕上一个字都没有），顾客提交完会**停在原地**，以为没提交上。
              tab 页只有 `wx.switchTab` 跳得过去。
           ⚠️ 这一处和 `pages/landing/` 那个「我的预约」是同一轮里被同一条规则
              逮到的两处 —— 自测里那条**全项目扫描**就是干这个的。 */
        wx.switchTab({ url: '/pages/guest-bookings/guest-bookings' })
      }
    }, 1800)
  }
})
