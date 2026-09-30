# 微信小程序：原生能力 vs 需要自行实现（给编码 AI 的对照清单）

> 用途：写小程序代码前先读这份。**凡是第一部分列出的能力，直接用官方 API / 组件，不要自己造；凡是第二部分列出的，框架没有现成的，需要自己实现、封装或接第三方。**
> 来源：微信官方文档 developers.weixin.qq.com/miniprogram/dev/。
> 关键认知：小程序 = 逻辑层（独立 JS 运行时，没有 DOM/BOM）+ 视图层（WebView）。前端网页的那一套（document、window、jQuery、直接操作节点、大部分浏览器 npm 包）**在小程序里不成立**。

---

## 一、框架已经做好的（不要重复造轮子）

### 1. 项目结构 / 构建 / 编译
- 项目骨架由开发者工具自动生成：`app.js` / `app.json` / `app.wxss` / `pages/xxx/{js,json,wxml,wxss}`。
- 不需要自己搭 webpack / vite / babel（开发者工具内置 ES6→ES5、压缩、分包构建）。
- 页面路由直接在 `app.json` 的 `pages` 数组里声明，不需要 react-router 之类。
- 分包加载、独立分包、预下载 `preloadRule` 在 `app.json` 配置即可。
- 全局样式写在 `app.wxss`，rpx 是响应式单位（750rpx = 屏宽），不用自己做 rem 换算。
- 暗黑模式、横竖屏、状态栏样式 在 `.json` 里配置。

### 2. 视图渲染（WXML）
- 声明式数据绑定 `{{ }}`、列表 `wx:for`、条件 `wx:if / wx:elif / wx:else`、`hidden`。
- 事件绑定 `bindtap / catchtap / input / change`，事件对象 `e.detail.value` 直接拿值。
- 内置组件几十个，**先查组件库再决定要不要自己写**：
  - 布局：`view` `text` `rich-text` `progress` `icon`
  - 滚动/轮播：`scroll-view` `swiper` `swiper-item` `movable-view`
  - 表单：`form` `input` `textarea` `button` `checkbox` `radio` `switch` `slider` `picker` `picker-view` `label` `editor`（富文本）
  - 媒体：`image` `video` `camera` `live-player` `live-pusher` `audio` `canvas` `map`
  - 导航栏：`navigation-bar` `tab-bar`（自定义导航）
  - 浮层：`modal` 不存在，用 `wx.showModal / showToast / showActionSheet` 原生 API
- 样式选择器不支持 `*`、属性选择器部分受限、不支持外链字体文件需 base64。

### 3. 路由与导航
- `wx.navigateTo`（新开页面，入栈）
- `wx.redirectTo`（当前页替换）
- `wx.switchTab`（切 tabBar 页）
- `wx.navigateBack`（返回，可指定 delta）
- `wx.reLaunch`（清空栈重启）
- `wx.navigateToMiniProgram`（跳其他小程序）
- 页面间传参：URL query + `onLoad(options)` 接收；跨页通信用 `EventBus` / `globalData`（这部分要自己封装，见第二部分）。

### 4. 网络 / 存储 / 文件
- `wx.request` 发 HTTPS 请求、`wx.uploadFile` / `wx.downloadFile`、`wx.connectSocket` WebSocket。
  - 注意：域名必须在小程序后台「服务器域名」里配置白名单，本地开发可勾「不校验合法域名」。
- `wx.setStorageSync / getStorageSync / removeStorageSync / clearStorageSync` 本地持久化（10MB 上限，异步版不带 Sync）。
- `wx.getFileSystemManager` 读写本地文件、`wx.openDocument` 打开文档（pdf/doc/xls 等）。
- 加密随机数：`wx.getRandomValues`。

### 5. 登录 / 用户 / 授权（微信生态原生）
- `wx.login` 拿临时 code → 发给自己后端换 openid / session_key / 自己的 token（**换 token 这步后端要自己写**，见第二部分）。
- `wx.checkSession` 检查登录态是否过期。
- `wx.getUserProfile` **已收紧**：不能静默拿头像昵称，改用
  - `<button open-type="chooseAvatar" bindchooseavatar="">` 让用户选头像
  - `<input type="nickname">` 让用户填昵称
- 权限系统全套：`wx.authorize` 提前请求、`wx.getSetting` 查权限状态、`wx.openSetting` 跳设置页。
  - 已覆盖 scope：location / camera / album / record / address / invoice / werun / writePhotosAlbum 等。
- `<button open-type="contact">` 拉起微信客服；`<button open-type="share">` 触发分享；`<button open-type="getPhoneNumber" bindgetphonenumber="">` 拿手机号（需企业认证）。

### 6. 分享 / 消息
- 页面内 `Page({ onShareAppMessage() { return { title, path, imageUrl } } })` 分享给好友。
- `onShareTimeline` 分享到朋友圈。
- `wx.requestSubscribeMessage` 订阅消息（一次性 / 长期），后端用 access_token 触发下发（后端逻辑自己写）。

### 7. 支付 / 商业
- `wx.requestPayment` 原生拉起微信支付（参数由后端统一下单后返回）。
- `wx.requestPayment` 只负责拉起，**下单、对账、退款、回调验签 全部后端自己做**。
- 微信小店、红包 `wx.showRedPackage`、卡券 `wx.addCard / openCard`、发票 `wx.chooseInvoice / chooseInvoiceTitle`、收货地址 `wx.chooseAddress`。

### 8. 设备能力（原生 API，不用自己接原生 SDK）
- 位置：`wx.getLocation` / `wx.chooseLocation` / `wx.choosePoi` / `wx.openLocation`。
- 扫码：`wx.scanCode`。
- 相册：`wx.chooseMedia / chooseImage`、`wx.previewImage`、`wx.saveImageToPhotosAlbum`。
- 录音：`wx.getRecorderManager()`。
- 相机：`<camera>` 组件 + `wx.createCameraContext()`。
- 蓝牙：通用 / BLE 中心 / BLE 外围 / Beacon 全套 API。
- NFC：读写（IsoDep / MifareClassic / Ndef / NfcA/B/F/V）、交通卡、主机卡模拟 HCE。
- Wi-Fi：`wx.getWifiList / connectWifi / onWifiConnected`。
- 传感器：加速计 / 罗盘 / 陀螺仪 / 设备方向（start/stop/onChange）。
- 屏幕：亮度、常亮 `setKeepScreenOn`、截屏监听 `onUserCaptureScreen`。
- 剪贴板、振动 `vibrateShort/Long`、打电话 `makePhoneCall`、发短信 `sendSms`、加日历/联系人。
- 网络状态：`wx.getNetworkType / onNetworkStatusChange / onNetworkWeakChange`。
- 电量、内存警告 `wx.onMemoryWarning`。

### 9. 媒体 / 地图 / 画布
- `<video>` + `VideoContext`、`<live-player>` / `<live-pusher>`（直播）。
- 音频：`InnerAudioContext`、`BackgroundAudioManager`（后台播放）、`WebAudioContext`（音频图）。
- 实时语音：`wx.joinVoIPChat / join1v1Chat`。
- 画面录制：`wx.createMediaRecorder`。
- 音视频合成：`wx.createMediaContainer`（剪辑、拼接、导出）。
- 视频解码：`wx.createVideoDecoder`（逐帧处理）。
- `<map>` 组件 + `MapContext`；但 **POI 搜索、路径规划、逆地址 要接腾讯位置服务**（见第二部分）。
- `<canvas type="2d">` + Canvas API（新版）；`Path2D`。

### 10. AI / AR（基础库 3.x）
- 端侧推理：`wx.createInferenceSession`。
- AR / 视觉：`wx.createVKSession`，支持人体、人脸、手势、平面、Marker、OCR 识别。
- 人脸检测：`wx.initFaceDetect / wx.faceDetect`。

### 11. 云开发（不想自己搭后端时）
- `wx.cloud` 一条龙：云函数（Node）、云数据库（文档型）、云存储、云调用（免 access_token 调开放接口）。
- 免登录鉴权：云函数里直接拿 openid。

### 12. 调试 / 发布
- 开发者工具内置：模拟器、Wxml 面板、Console、Sources 断点、Network、AppData、Storage、Trace。
- 真机预览（扫码）、真机调试（远程断点）、多账号调试、性能面板。
- 版本更新：`wx.getUpdateManager` 检测新版本（但弹窗 UI 自己写）。
- 上传 / 提审 / 发布 走开发者工具 + 微信公众平台后台。

---

## 二、框架没有现成的（必须自己实现 / 封装 / 接第三方）

### 1. 运行时限制导致的（**最容易踩坑**）
- ❌ 没有 `document` / `window` / `DOM` / `BOM`。
  - 不能 `document.querySelector`、不能直接改节点样式、不能操作 cookie。
  - 不能用 jQuery / Zepto / 大部分依赖 DOM 的 npm 包（如 cheerio、jsdom、依赖 window 的 UI 库）。
- ❌ 逻辑层 ≠ 完整 Node.js。
  - 没有 `fs` / `net` / `child_process`；`require('xxx')` 只支持相对路径 + 已通过「npm 构建」的包。
  - 部分 npm 包装不上，需要用小程序兼容版本（如 `lodash.min`、专用的 `mobx-miniprogram`）。
- ❌ 不能动态执行任意 HTML。
  - `<rich-text>` 只支持有限节点子集；复杂 HTML/Markdown 渲染用 **mp-html** / **Towxml**。
- ❌ CORS 概念不适用，但有**合法域名白名单**（HTTPS、不能用 IP、不能带端口号除少数）。
- ❌ 没有 `localStorage` / `sessionStorage`，用 `wx.setStorageSync`。
- ❌ `setData` 是性能红线：**只传变化的字段，不要全量传对象；不要频繁 setData；数据量大会卡顿**。

### 2. 状态管理 / 跨页通信（自己封装）
- `Page.data` 是页面级的，页面销毁就没了。
- 跨页面共享状态：
  - 简单场景：`App.globalData`（但不会触发视图更新）。
  - 中等：自己写一个 EventBus（`wx.$on / $emit`）。
  - 复杂：用官方推荐的 `mobx-miniprogram` + `mobx-miniprogram-bindings`，或 `miniprogram-computed`。
- 没有 Vuex / Redux 等价物，自己选方案。

### 3. 网络层封装（自己包）
- `wx.request` 是裸 API。需要自己封装：
  - baseURL、token 自动注入
  - 统一 loading / 错误 toast
  - 401 自动跳登录 / 静默续期
  - 请求取消、重试、超时
  - 请求/响应拦截器
- 建议自己写一个 `request.js`，返回 Promise。

### 4. 登录与账号体系（后端要自己做）
- `wx.login` 给的只是 code。完整流程：
  1. 前端 `wx.login()` 拿 code
  2. code 发后端 → 后端调 `auth.code2Session` 换 openid + session_key
  3. 后端根据 openid 查/建用户，签发**自己的 JWT / session**
  4. 前端缓存自己的 token，后续请求带上
- session_key 解密手机号、用户信息 都在**后端**做，绝不能放前端。
- 多端账号合并（同一用户在 App / 公众号 / 小程序对应不同 unionid）自己设计。
- 登录过期、踢出、强制重新登录的策略自己定。

### 5. UI 组件增强（内置组件不够用时）
- 官方内置的是**原语**，业务常用复杂组件需要第三方库或自己写：
  - 推荐库：**Vant Weapp**、**TDesign Miniprogram**、**NutUI Miniprogram**、**ColorUI**。
- 常见要自己封装的：
  - Toast / Dialog / ActionSheet：有 `wx.showToast / showModal / showActionSheet`，但自定义样式的弹窗要自己写。
  - 日期时间选择器：`<picker mode="date/time">` 是基础的，复杂范围选择、带快捷选项要自己做。
  - 级联选择（省市区）：数据 + UI 自己做或接第三方。
  - 表单校验：无内置，自己写 rules。
  - 骨架屏：自己写（或用开发者工具的骨架屏生成）。
  - 下拉刷新增强 / 上拉加载分页逻辑（`onPullDownRefresh / onReachBottom` 有，但分页、空态、错误态、loading 自己写）。
  - 虚拟列表 / 长列表：scroll-view 自己实现分页，超长列表用 `recycle-view` 类库。
  - 海报生成：用 `<canvas>` 自己画（截图保存 `wx.canvasToTempFilePath`）。

### 6. 业务功能（平台不管）
- **内容安全审核**：用户发的文本/图片/音视频必须调 `security.msgSecCheck` / `mediaCheckAsync`，否则审核不通过。前端不调就被拒。
- **隐私协议弹窗**（基础库 2.32+ 强制）：用 `wx.getPrivacySetting` + `wx.onNeedPrivacyAuthorization`，自己做隐私授权弹窗 UI。
- **订阅消息后端下发**：前端只弹一次授权，真正下发靠后端调 `subscribeMessage.send`。
- **支付后端**：统一下单、回调验签、对账、退款、发票，全在后端。
- **地图能力**：`<map>` 只是显示，POI 搜索、关键词检索、路径规划、逆地址解析 要接腾讯位置服务（需 key）。
- **数据埋点**：微信自带「数据分析」有基础漏斗，但自定义事件、用户行为序列、A/B 测试 要自己接或用第三方。
- **错误监控**：`App.onError / onPageNotFound / onUnhandledRejection` 能拿到错误，但上报、聚合、sourcemap 还原 要自己做（或接 Sentry 类）。
- **版本更新弹窗**：`wx.getUpdateManager` 能拿到 `onUpdateReady`，但弹窗 UI、引导重启 自己写。
- **弱网 / 离线**：网络状态能监听，但离线缓存、请求重试队列、本地操作暂存 自己实现。
- **分享海报 / 生成图**：自己用 canvas 画。
- **客服消息自动回复 / 社群运营**：自己接后端。
- **跨端复用**（一套代码发支付宝/抖音/百度小程序）：要用 Taro / uni-app / mpvue 等跨端框架，原生微信小程序做不到。

---

## 三、给编码 AI 的硬约束清单（写代码时直接遵守）

1. **不要写**：`document.`、`window.`、`localStorage`、`sessionStorage`、`jQuery`、`$('...')`、`<script>` 引用 CDN、操作 cookie。
2. **改样式 / 改节点**：通过 `this.setData({ key: value })` 驱动 WXML 重新渲染，**不要**直接操作 DOM。
3. **异步 API 大多有 Promise 化**：不带 `Sync` 后缀的 API 支持 `wx.xxx({ ... })` 传 success/fail/complete，也支持 `await wx.xxx({ ... })`（基础库 2.10.2+）。
4. **页面生命周期**：`onLoad / onShow / onReady / onHide / onUnload / onPullDownRefresh / onReachBottom / onShareAppMessage / onShareTimeline / onPageScroll / onTabItemTap`。
5. **组件生命周期**：`attached / ready / detached / observers`（properties 监听用 `observers`，不是 watch）。
6. **setData 性能**：
   - 只传变化的字段：`this.setData({ 'list[0].name': 'x' })` 支持路径。
   - 单次 setData 数据量 < 256KB，频繁 setData（如滚动）会掉帧。
7. **rpx 单位**：设计稿按 750 宽度出，1px = (设计稿 px / 750) * 750 rpx，不要用 px 做响应式布局。
8. **图片**：用 `<image>` 组件，不是 `<img>`；默认宽度 320px 高度 240px，要手动设宽高。
9. **点击事件**：用 `bindtap`，不是 `onclick`；阻止冒泡用 `catchtap`。
10. **样式**：WXSS 支持 flex，但不支持 `*` 选择器、不支持嵌套（除非开启 SCSS）、不支持 `!important` 以外的部分 CSS 特性。
11. **第三方 npm 包**：必须经过「工具 → 构建 npm」，且依赖不能是浏览器环境的包。
12. **网络请求域名**：后端域名必须在小程序后台白名单；本地开发在详情 → 本地设置 勾「不校验合法域名」。
13. **登录**：不要在前端写死 AppSecret；所有需要 secret 的操作必须走后端或云函数。
14. **按钮样式**：`<button>` 有默认样式（边框、最小宽度），要重置；开放能力用 `open-type`，不是 `bindxxx`。
15. **跳转 tabBar 页**：只能用 `wx.switchTab`，不能用 `navigateTo`。
16. **页面栈上限 10 层**：超过会 `navigateTo` 失败，超过 10 层时改用 `redirectTo` / `reLaunch`。
17. **包大小**：主包 < 2MB，整包 < 20MB（用分包）。
18. **用户头像昵称**：不能再用 `wx.getUserProfile` 静默拿，用 `button open-type="chooseAvatar"` + `input type="nickname"`。

---

## 四、一句话总结

> 微信给你：路由、UI 原语、设备能力、支付/分享/登录/订阅消息的**原生拉起**、云开发、调试工具。
>
> 你自己做：业务状态管理、请求封装、登录后端、复杂 UI 组件、内容安全审核、数据埋点、错误上报、离线弱网体验、跨端。

写代码前先在「一」里查有没有现成的；没有再去「二」里找方案；写的时候遵守「三」的硬约束。
