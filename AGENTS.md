# AGENTS.md — 楚汉 RTS 项目交接书

> **这个项目共有三份文档，请全部读完再动手，不要只读一份就开始改代码。**
>
> | 文档 | 作用 | 什么时候读 |
> | --- | --- | --- |
> | **本文件 AGENTS.md** | 怎么跑、代码在哪、有什么规矩、当前状态 | 每次接手必读 |
> | [docs/DESIGN.md](docs/DESIGN.md) | 游戏设计蓝图：玩法、阵营、数值、设计原则 | 加内容/改玩法前必读 |
> | [docs/ROADMAP.md](docs/ROADMAP.md) | 版本规划与进度清单 | 决定下一步做什么前必读 |
>
> 面向人类读者的简介在 [README.md](README.md)。
> 早期的一版规模评估稿 [RTS-Assessment.md](RTS-Assessment.md) 已完成使命，只作历史参考，不要照它执行。

---

## 一句话

浏览器里运行的**楚汉题材等距视角即时战略游戏**（RTS），玩法参照红警式的单位微操：
运粮攒粮草 → 造兵营出兵 → 兵种相互克制 → 推平对方大营。

**不是**红警复刻，**不要**还原红警的美术风格、不要做 3D。美术全部程序化生成，仓库里没有任何图片素材。

---

## 快速开始

```bash
npm install --ignore-scripts --no-audit --no-fund   # 见下方"已知坑"第 1 条
npm run build        # tsc 编译到 dist/（没有打包器）
npm run serve        # 起静态服务器，端口 5273
```

浏览器打开 <http://127.0.0.1:5273/>。

日常命令：

| 命令 | 作用 |
| --- | --- |
| `npm run check` | 只做类型检查，不产出 |
| `npm run build` | 编译到 `dist/` |
| `npm run serve` | 起本地服务器 |
| `npm run simtest` | **headless 跑一局 6 分钟模拟**，不涉及浏览器，最快的回归手段 |

如果 `npm run xxx` 因为环境问题跑不起来，等价的直接命令：

```bash
node node_modules/typescript/bin/tsc -p tsconfig.json
node server.mjs
node dist/scripts/simtest.js
```

调试用的 URL 参数：

| 参数 | 作用 |
| --- | --- |
| `?auto=1` | 跳过开局界面，直接用默认设置开打 |
| `?auto=1&map=river` | 指定地图（`plains` / `river` / `mountain` / `islands`） |
| `?auto=1&faction=chu` | 玩家选楚军 |
| `?auto=1&selftest=1` | 跑一遍自动化交互自测，结论输出到 `document.title` 和页面底部 |

---

## 技术选型（以及为什么这么选）

| 选择 | 原因 |
| --- | --- |
| TypeScript，**不打包** | `tsc` 直接编译成浏览器可用的 ES 模块，`index.html` 里用 import map 引 `pixi.js` |
| PixiJS v8（WebGL） | 只负责渲染，不参与逻辑 |
| 零依赖静态服务器 `server.mjs` | 40 行 Node http 服务，额外把 `/vendor/pixi.mjs` 映射到 `node_modules` |
| 模拟层 Node 可跑 | `src/sim/` 不碰 DOM，所以能在终端里跑完整对局做回归 |

**不要引入 Vite / Webpack / esbuild / Rollup。** 原因见"已知坑"第 2 条，这是硬约束。

---

## 代码地图

```
index.html            页面骨架 + HUD/菜单的全部 CSS
server.mjs            静态服务器（端口 5273）
package.json          脚本定义
tsconfig.json         target ES2022 / module ESNext / moduleResolution bundler / outDir dist

src/
  main.ts             启动流程、主循环、开局参数解析、自动化自测
  sim/                ★ 纯模拟层：确定性 20Hz tick，无渲染、无 DOM、可在 node 里跑
    types.ts          实体 / 指令 / 事件的类型定义
    stats.ts          ★★ 唯一的数值表：单位、建筑、弹头×装甲克制矩阵
    map.ts            地形生成：4 种地图预设、镜像对称、连通性自动保证
    path.ts           A* 寻路 + 超覆盖视线（禁止切角）
    rng.ts            确定性伪随机（mulberry32）
    world.ts          ★ 核心循环：命令、移动、战斗、经济、生产、放置、胜负
    ai.ts             电脑对手：建造计划、混编产能、波次进攻、回防
  render/             表现层：只读模拟状态，绝不回写
    iso.ts            等距投影换算
    textures.ts       程序化生成全部贴图（几何图形烘焙，无图片文件）
    renderer.ts       PixiJS 场景、相机、选框、选中高亮、血条、特效
  input/
    controller.ts     鼠标键盘 → 指令：框选、编队、右键下令、建造放置
  ui/
    hud.ts            底部建造面板、生产队列、小地图、提示条、结算
    menu.ts           开局界面：选阵营 + 选地图，缩略图由真实地图数据绘制

scripts/
  simtest.ts          headless 冒烟测试，断言经济/生产/单位不越界/不 NaN
```

### 三层铁律

```
输入层 (input/) ──指令──▶ 模拟层 (sim/) ──状态──▶ 表现层 (render/)
                              ▲
                              └── 表现层只读，绝不反向写入
```

模拟层必须保持**确定性**：同样的种子 + 同样的指令 = 同样的结果。
这是将来加联机（锁步同步）和回放的前提，破掉它就得推倒重来。

---

## 规矩（改代码前务必看）

1. **数值只改 `src/sim/stats.ts`。** 血量、造价、射程、伤害、克制倍率全在那里，不要在 `world.ts` 里写魔法数字。
2. **模拟层禁止 `Math.random()`。** 需要随机就用 `world.rng`（`Rng` 实例）。渲染层不受此限。
3. **渲染层不许修改模拟状态。** 想加视觉反馈就订阅 `world.events`，别去动 `unit.x`。
4. **保持 20Hz 固定步长。** `TICK_RATE = 20`，主循环用累加器补帧，不要改成按帧时长驱动。
5. **不引入任何打包器/原生二进制工具。** 见下方已知坑。
6. **不提交 `dist/`、`node_modules/`、`.npm-cache/`。** `.gitignore` 已经排除。
7. **改完必须跑 `npm run simtest`。** 它能在 2 秒内发现大部分逻辑崩溃。
8. 中文注释和中文 UI 文案都是允许且鼓励的。

---

## 已知坑（踩过的，别重踩）

1. **npm 装依赖要加 `--ignore-scripts`。** 本机受 Windows 沙箱限制，依赖的 postinstall 脚本（spawn 子进程 + 管道）会报 `EPERM`。另外 npm 缓存目录也要指到工作区内：`$env:npm_config_cache = "<工作区>\.npm-cache"`，否则写 `C:\Users\...` 会被拒。
2. **不要用需要 spawn 原生二进制的工具**（vite / esbuild / rollup / playwright）。沙箱禁止管道通信，它们起不来。这就是为什么项目用 `tsc` 直出而不是打包。
3. **git 不读 Windows 系统代理。** 本机系统代理是 `127.0.0.1:7899`，仓库级已经配好 `http.proxy`。换机器要重配：`git config http.proxy http://127.0.0.1:<端口>`。GitHub 访问需要 VPN。
4. **`curl.exe` / PowerShell 的 `Invoke-WebRequest` 在本机走 schannel，会报 `SEC_E_NO_CREDENTIALS`。** 要测网络连通性用 node 的 `fetch`。
5. **无头 Chrome 截图偶尔会挂起**，需要 `--no-sandbox --disable-gpu --enable-unsafe-swiftshader`，并轮询截图文件是否生成，超时就 kill 掉进程重试。
6. **改完源码记得重新 `npm run build`。** 服务器直接读 `dist/`，不编译就看不到变化。

---

## 当前状态（截至 2026-11-17）

**版本：1.0 可玩竖切，已可完整打完一局**

已经能用的：

- [x] 开局界面：选阵营（汉/楚）+ 选战场（平原/河网/山地/海岛，缩略图是真实地图）
- [x] **开局军旗**（内部单位名 `mcv`）：可移动到任意位置，按 `F` 立旗扎营建起大营；立旗前无法建造
- [x] **仓廪落成附赠一辆粮车**，经济自动启动
- [x] 等距战场渲染、相机平移缩放、小地图
- [x] 框选、Shift 加选、双击同类全选、Ctrl+数字编队
- [x] 右键移动 / 右键攻击 / 攻击移动
- [x] 粮车往返农田与仓廪的经济循环
- [x] 建筑建造队列 + 落地放置（含红绿预览）+ 集结点
- [x] 单位生产队列
- [x] 6 种战斗兵种 + 粮车，4 种建筑
- [x] 弹头×装甲克制矩阵
- [x] 会造兵、会混编、会按波次进攻、会回防的 AI
- [x] 胜负判定与结算界面
- [x] headless 冒烟测试

**还没做**（详见 ROADMAP）：

- [ ] 战争迷雾
- [ ] 音效与音乐
- [ ] 存档 / 读档
- [ ] 平衡调优（目前楚军骑射偏强）
- [ ] 更多地图、地图编辑器
- [ ] 2.0 三国版本
- [ ] 联机

---

## 交接后第一步该做什么

1. 通读三份文档
2. 跑一次 `npm run build && npm run simtest`，确认基线是绿的
3. 打开 <http://127.0.0.1:5273/> 亲手打一局，感受手感
4. 到 [docs/ROADMAP.md](docs/ROADMAP.md) 挑一个未完成项，或按用户的新需求推进
5. 改完 → 跑 simtest → `git commit` → `git push`

推送凭据已由 Git Credential Manager 保存在 Windows 凭据管理器里，`git push` 应该可以直接用。
