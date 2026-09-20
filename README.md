# 家庭待办（Family Todo）

一个零依赖、纯前端、面向家庭协作的待办事项 PWA。三口之家自用，已稳定运行。  
**单 HTML 文件 + Service Worker + Firebase Realtime Database**，不引入任何框架或构建工具。

> 16 万字符的单文件应用 / 22 次迭代 / 10+ 已知坑的解决方案 

---

## 功能概览

- **多人实时协作**：基于 Firebase RTDB，同一房间成员所有改动毫秒级同步；离线先写本地 + 联网后自动合并
- **成员与房间**：本地身份（匿名 ID + 头像色） + 房间机制 + 邀请链接；支持"被管理员移除"和"主动退房"
- **任务管理**：创建 / 编辑 / 完成 / 删除 / 优先级（4 级）/ 截止日期（友好格式：今天/明天/N 天后/逾期 N 天）/ 重复任务（每天/每周/每月/每年，支持自定义间隔）
- **筛选与分组**：按成员过滤、按清单分组折叠、按完成状态分组
- **成员管理**：添加 / 移除成员（带墓碑机制避免被移除者自动复活）
- **本地通知**：可设定时点（如每天 09:00）对当日到期任务推送浏览器通知（基于 Notification API + Service Worker）
- **PWA 离线**：Service Worker 缓存所有资源，断网完全可用
- **可添加到主屏**：iOS Safari / Android Chrome 一键添加，主屏图标 + 沉浸式体验

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| UI | 原生 HTML/CSS/JS | 无任何框架；4316 行单文件 |
| 状态管理 | 自研事件总线 + 订阅 | `subscribeToRoom` 推送增量更新 |
| 持久化（本地） | localStorage | 状态、待通知任务、提醒时间偏好 |
| 持久化（云端） | Firebase Realtime Database | 房间数据通过 RTDB 同步，零服务器 |
| 推送 | Service Worker + Notification API | `SCHEDULE_REMINDERS` 消息从页面侧驱动 SW 调度 |
| PWA | manifest.json + Service Worker | 可安装、可离线、可后台 |
| 安全规则 | `FIREBASE_RULES.md` | RTDB 读写权限配置文档 |

**选型理由**：零后端 → 维护成本接近零；纯前端 → 任何静态托管（GitHub Pages / Netlify）即可部署。

---

## 快速开始

### 1. 部署

```bash
# 任何静态托管都可, 此处以 GitHub Pages 为例
git push origin main
# 在 GitHub 仓库 Settings → Pages 开启 Pages 即可
```

> 首次部署后，用手机或电脑打开域名，记下"房间 ID"——通常分享链接的 hash 里就有。

### 2. Firebase 配置（自用必读）

打开 `index.html`，将以下占位符替换成你的 Firebase 项目配置：

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "..."
};
```

然后根据 [`FIREBASE_RULES.md`](./FIREBASE_RULES.md) 配置 RTDB 规则（务必限制匿名用户只能读写自己创建的房间节点）。

### 3. 邀请家人

打开应用 → 顶部菜单 → "分享房间"，把生成的链接发给家人。对方在**同一台设备**打开链接后会弹"加入此清单"确认；点击加入后会自动同步。

---

## 项目亮点

### 1. 离线优先 + 自动合并

所有写操作先落本地（localStorage）→ 立刻更新 UI → 后台推 RTDB → 远端推送下来时按 clientId 增量合并。
断网体验与联网一致，连网时无需用户手动触发。

### 3. 成员"墓碑（tombstone）"机制

成员移除时不仅把成员从列表里删，还写入 `removedMembers` 墓碑。被移除设备收到远端数据后：
1. 不再触发"自愈注册身份"（会读到墓碑）
2. 检测"所有清单都不含我 + 我有墓碑" → 自动退房 + 提示用户
3. 主动重新加入时清墓碑 → 正常回归

防止"被管理员移除后下次打开又自动复活"的竞态 bug。

### 4. PWA 状态栏遮挡的隐性坑

`viewport-fit=cover` + standalone 模式下，`env(safe-area-inset-top)` 在 iOS WebKit 和 Android Chrome 的 webview 中**普遍返回 0**，导致顶部导航栏被状态栏遮挡。最终方案：**不依赖 env()**，去掉 `viewport-fit=cover`，让系统自动留出区域。详见代码注释。

### 5. 自愈机制与业务语义的冲突

`ensureMyMembership` 的初衷是"如果我的 clientId 不在成员列表里，自动加回来"——防止离线期间被其他成员误操作清除。
但"被管理员主动移除"恰好也命中"我不在成员列表"这个特征。修复办法不是改自愈逻辑，而是引入墓碑显式表达"这是被移除，不是数据丢失"。

---

## 项目结构

```
family-todo/
├── index.html         # 单文件应用本体（HTML+CSS+JS, 4316 行）
├── service-worker.js  # 缓存 + 通知调度（153 行）
├── manifest.json      # PWA 配置
├── icon-*.png         # 应用图标（192/512/180）
├── FIREBASE_RULES.md   # RTDB 安全规则文档
└── README.md          # 本文件
```

---

## 已知限制

- **单文件臃肿**：4316 行单文件，调试尚可，重构成本高。功能稳定后无回归，价值大于风险。
- **不支持富文本**：任务正文是纯文本一行。
- **没有端到端加密**：RTDB 数据由 Firebase 持有，隐私性依赖 Firebase 自身。
- **iOS Safari 添加主屏后才支持后台通知**：浏览器模式下通知受限于系统策略。

---

## 路线图

- [x] 成员筛选（chips + 任务快捷筛选）
- [x] 任务卡单行紧凑布局（Things 3 风格）
- [x] 主屏模式状态栏遮挡修复
- [ ] 标签系统
- [ ] 看板视图（待办 / 进行中 / 已完成）
- [ ] 多语言（英文版 UI）
- [ ] 数据导出（CSV / JSON）

---

## License

MIT — 自用项目，但代码可自由复用。
