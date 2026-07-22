# CryWolf

基于 Cocos Creator 3.8.4 开发的竖屏滑动解谜游戏。

- 固定在线试玩地址：[https://game.gongganghao.com/](https://game.gongganghao.com/)
- GitHub 仓库：[gensisboss/CryWolf](https://github.com/gensisboss/CryWolf)
- 设计分辨率：`1080 x 1920`
- Cocos Creator：`3.8.4`
- Web 发布分支：`gh-pages`

## 修改前必读

任何开发者或自动化代理在修改项目之前，都必须先完整阅读本文件，并按照这里的约束执行。

1. 先运行 `git status --short`，确认工作区中已有的用户修改。
2. 不得回退、覆盖或提交与本次任务无关的修改。
3. 修改前先阅读目标模块、相关测试、预制体及资源引用关系。
4. UI 表现以预制体为准，运行时代码只负责数据绑定、动态地图和交互逻辑。
5. 所有可见美术内容必须有明确资源或统一的运行时绘制规范，不得使用临时占位图。
6. 修改完成后必须测试、构建、同步 `docs`、提交并推送线上。
7. 线上地址固定使用 `https://game.gongganghao.com/`，不得追加版本号或查询参数。

## 项目架构

### 启动场景

`assets/scenes/Main.scene` 是唯一启动场景，负责：

- 挂载 `GameApp` 组件。
- 放置全局背景 `main-bg`，背景不属于任何 UI 预制体。
- 放置全局云层节点，作为关卡和界面切换的过场动画。
- 引用 `UIMain`、`UIGame`、`UIGuide`、`UIEditor` 预制体。

项目不再使用 `UILoading` 预制体。加载效果统一由场景中的云层和 `LoadingTransition` 管理。

### 领域层

目录：`assets/game/scripts/domain`

- `GameTypes.ts`：关卡、角色、状态、移动结果和事件类型。
- `EntityCatalog.ts`：角色编号、类型和美术变体映射。
- `GameRules.ts`：纯逻辑移动、障碍、陷阱、进村、狼吃羊和胜负计算。
- `LevelEditorRules.ts`：地图创建、缩放、放置、导入和导出规则。
- `ViewportRules.ts`：6 x 6 视野、摄像机跟随和大地图视口计算。

领域层不得依赖 Cocos 节点、组件或渲染 API。规则修改必须优先在这一层完成，并添加单元测试。

### 数据层

目录：`assets/game/scripts/data`

- `GameDataRepository.ts`：加载并规范化关卡和引导 JSON。

运行时数据：

- `assets/resources/data/levels.json`：50 个正式关卡。
- `assets/resources/data/guides.json`：角色和机制引导。

结构化数据必须通过 JSON 解析和序列化修改，不得用字符串替换破坏格式。

### 表现层

目录：`assets/game/scripts/presentation`

- `AssetCatalog.ts`：集中加载所有 SpriteFrame，并按角色编号选择素材。
- `BoardView.ts`：生成地图格子、角色节点、遮罩、摄像机和事件动画。
- `SlideMinimapView.ts`：大地图右上角小地图及拖动视口功能。

地图逻辑与地图渲染必须分离。地图可以完整生成，但显示区域始终由 6 x 6 遮罩裁剪。

### UI 层

目录：`assets/game/scripts/ui`

- `GameApp.ts`：游戏总流程、界面绑定、关卡切换、编辑器和结算。
- `UiScreenManager.ts`：预制体界面实例化和生命周期。
- `UiFactory.ts`：运行时通用节点、文字、按钮和像素面板绘制。
- `LoadingTransition.ts`：全局云层过场和异步加载队列。
- `SoundManager.ts`：背景音乐与事件音效管理。

### 存储层

目录：`assets/game/scripts/storage`

- `ProgressStore.ts`：关卡进度、已看引导和自定义关卡持久化。

### UI 预制体

目录：`assets/resources/ui`

- `UIMain.prefab`：主界面。
- `UIGame.prefab`：游戏 HUD 和地图容器。
- `UIGuide.prefab`：聚光引导层。
- `UIEditor.prefab`：关卡编辑界面。

每个预制体必须按 `TopContainer`、`MiddleContainer`、`BottomContainer` 分组。禁止把全部节点平铺在根节点下。

图片组件和文字组件不得挂在同一个节点上。需要图文组合时，使用父容器加独立的图片、文字子节点。

## 功能设计

### 地图与视野

- 地图最小尺寸：`1 x 1`。
- 地图最大尺寸：`20 x 20`。
- 屏幕内地图视野固定为最多 `6 x 6`。
- 所有地图格子一次性生成，遮罩外节点存在但不可见。
- 大地图出现小地图，可拖动小地图修改视野。
- 角色移动时摄像机与被跟随小羊使用相同持续时间和缓动曲线。
- 滑动在手指移出屏幕后仍需通过 `TOUCH_CANCEL` 完成方向判断。
- 地图边框必须位于地图内容和遮罩之上。
- 地图底图尺寸必须覆盖完整地图，而不是只覆盖 6 x 6 视口。
- `BoardView` 只生成随完整地图尺寸变化的 `MapBase`，不得在游戏或编辑器中间额外铺设固定视口大小的背景图。

### 移动规则

- 一次滑动会按方向结算所有可移动角色。
- 可移动障碍必须先参与本回合位置计算，其他角色不得把障碍旧位置视为阻挡。
- 可移动障碍无专用背景；固定障碍有背景。
- 小羊进入羊村计入逃脱目标。
- 小羊或狼进入陷阱后消失。
- 陷阱触发后会从当前状态中移除，对应格子的陷阱图案和红色底图必须同时恢复为普通地图底色。
- 狼完成滑动后可以吃掉相邻小羊。
- 回合计算不得直接修改输入状态，以保证撤销和重放可靠。

### 事件动画

- 普通滑动：角色与摄像机同步平滑移动。
- 进入羊村：小羊跃起后缩小进入村口。
- 陷阱死亡：角色旋转、下沉并淡出。
- 狼吃羊：狼先蓄力后扑击，小羊抖动并消失。
- 撤销：恢复角色淡入并回到上一状态。

动画只消费 `GameRules` 返回的事件，不得在表现层重复推断规则结果。

### 音频

音频目录：`assets/resources/audio`

- `bgm.wav`：循环背景音乐，使用独立 AudioSource。
- `click.wav`：按钮点击。
- `slide.wav`：角色滑动。
- `escape.wav`：小羊进村。
- `eat.wav`：狼吃羊。
- `death.wav`：死亡反馈。
- `trap.wav`：陷阱反馈。
- `win.wav`、`lose.wav`：结算。
- `transition.wav`：云层过场。
- `undo.wav`、`guide.wav`：撤销和引导。

浏览器可能禁止自动播放。首次玩家操作必须再次安全调用背景音乐启动逻辑。

生成音频使用 `node tools/generate-audio.cjs`。新增音频后必须确认 `.wav.meta` 存在，并在构建包中按哈希验证资源已导入。

### 关卡设计

- 前 10 关介绍角色、陷阱、固定/移动障碍和基本组合规则。
- 每次首次出现新角色或新机制时，必须在 `guides.json` 中提供介绍。
- 第 11 关开始，不能只靠观察直接看出完整解法。
- 第 20 关以后允许使用超过 6 x 6 的地图。
- 第 30 关以后难度明显提升，需要多角色、多目标和失败分支组合。
- 每一关必须使用真实规则引擎搜索确认存在通关方式。
- 不能只检查“有解”，还要关注最短通关步数、目标羊数量和失败分支。
- 本地存储记录玩家历史最大通关数量；启动游戏或从主页再次进入时，直接恢复到最高进度后的待挑战关卡，全部通关时停留在第 50 关。
- 旧版本保存的最大解锁关卡会自动迁移为最大通关数量，编辑器试玩不得修改正式关卡进度。

关卡验证：

```powershell
node tools/analyze-campaign.cjs
npm.cmd test
```

`tests/campaign-solutions.test.cjs` 会验证全部关卡可解，并检查部分强化关卡的最短解深度。

### 关卡编辑器

- 地图尺寸限制为 `1 x 1` 到 `20 x 20`。
- 编辑器没有独立擦除工具。
- 只要格子中已有任意角色，再次点击该格子就会清除，不受当前选择类型影响。
- 空格子点击后放置当前选择的角色；需要替换类型时先清除，再放置。
- 切换角色分类或具体素材时只能刷新底部素材栏，不得重建编辑器预制体、地图或当前视口。
- 编辑器输入回调中不得同步删除、重建当前按钮或其父节点；素材栏和整页刷新必须延迟到触摸事件分发结束后的下一帧执行。
- 保存时输出 UTF-8 JSON，并保存到本地进度存储。

### 加载与切换

- 切换界面、切换关卡和加载新关卡时显示云层过场。
- 云层在屏幕中心停留时间由异步加载任务完成时间决定。
- 使用 `LoadingTransition.run(async () => { ... })` 包装加载任务。
- 不要为普通同步操作滥用加载动画。

## 美术与布局约束

- 整体采用像素绘本风格：低饱和自然绿、暖木色面板、深色描边和局部高光。
- `main-bg` 只放在场景最底层，禁止放回任何 UI 预制体。
- 云层位于场景最上层，但应在非过场状态隐藏或移出屏幕。
- 按钮应复用既有按钮画布和 SpriteFrame 几何，不得随意改变背景比例。
- UI 节点以预制体为最终表现来源，禁止在代码中重新创建一套与预制体重复的静态界面。
- 禁止保留与当前预制体界面重复的 Legacy 动态 UI 实现；废弃界面必须连同不可达入口和专用辅助方法一起删除。
- 游戏和编辑器中央地图属于动态内容，不得序列化进预制体。
- 固定格式节点必须设置明确尺寸，避免分辨率变化导致布局跳动。

## 测试与检查

每次修改后至少执行：

```powershell
npm.cmd test
npm.cmd run typecheck
```

当前测试覆盖：

- 50 关可解性与最短解深度。
- 移动障碍与其他角色的位置结算。
- 小羊进村、陷阱、狼吃羊、胜负和撤销。
- 最大 20 x 20 地图与 6 x 6 视口。
- 编辑器放置、缩放、导出和再次点击清除。
- 预制体结构、组件分离和资源引用。
- 音频格式和 Cocos 元数据。
- 场景、设计分辨率和加载系统结构。

测试通过不等于视觉验收完成。涉及 UI、地图、动画或资源时，还必须运行构建并实际检查桌面和手机比例画面。

## Web 构建

构建前先确认没有残留的无窗口 `CocosCreator` 进程占用项目。如果编辑器窗口正常打开，不得强制结束进程；应先保存编辑器内容并正常关闭。

命令行构建：

```powershell
C:\ProgramData\cocos\editors\Creator\3.8.4\CocosCreator.exe `
  --project D:\Tool\CryWolf `
  --build "platform=web-mobile;debug=false;outputName=web-mobile"
```

不能只根据命令退出码判断成功。必须检查：

1. `build/web-mobile/index.html` 存在且修改时间为本次构建时间。
2. Cocos 后台构建进程已完成写入。
3. 新增资源确实存在于 `build/web-mobile/assets`。
4. 新增音频应使用 SHA-256 与源文件比对。

本地预览：

```powershell
npm.cmd run preview:web
```

默认地址为 `http://127.0.0.1:7456/`。端口被占用时可设置 `PORT` 环境变量使用其他端口。

## 修改完成后的发布流程

每次修改完成后必须直接推送线上，不需要等待再次提醒。

### 1. 检查工作区

```powershell
git status --short
git diff --stat
```

只处理本次任务相关文件。Cocos 可能自动修改 `settings/v2/packages/information.json` 等编辑器配置，若与任务无关则不得提交。

### 2. 测试

```powershell
npm.cmd test
npm.cmd run typecheck
```

任何失败都必须先修复，不能带失败发布。

### 3. 构建并核验

重新构建 `web-mobile`，确认时间戳和新增资源进入构建包。

### 4. 同步静态站点

```powershell
npm.cmd run publish:web
```

该命令会：

- 将 `build/web-mobile` 完整复制到 `docs`。
- 将 Cocos 的 `native` 目录转换为 Pages 使用的 `native-assets`。
- 写入 `.nojekyll`。
- 写入固定域名 `CNAME`：`game.gongganghao.com`。

如果构建目录不完整，禁止运行发布脚本，否则可能清空 `docs`。

### 5. 提交并推送 main

```powershell
git add -- <本次相关源码、资源、测试、README 和 docs 文件>
git commit -m "<清晰的修改说明>"
git push origin main
```

不得使用 `git add .`，避免提交用户修改和无关的Cocos设置文件。

### 6. 更新 GitHub Pages

从 `docs` 生成部署分支并更新现有 `gh-pages`：

```powershell
git subtree split --prefix docs -b codex/pages-deploy
git push origin codex/pages-deploy:gh-pages --force
```

如果本地临时分支已存在，应先确认它不是用户分支，再删除或换用新的 `codex/` 临时分支名。

### 7. 线上验证

必须验证以下地址返回 `HTTP 200`：

- `https://game.gongganghao.com/`
- 本次新增的至少一个关键资源地址。

涉及运行时行为时，还应打开固定网址实际试玩，检查控制台无错误。

## Git 与文件安全

- 禁止使用 `git reset --hard` 或 `git checkout --` 回退整个工作区。
- 不得删除或回退无法确认来源的用户修改。
- 不得修改线上固定域名。
- 不得在未验证构建完成时覆盖 `docs`。
- 不得把 `build`、`library`、`temp` 或Cocos缓存作为源码提交，除非现有仓库策略明确要求。
- `docs` 是需要提交的线上静态构建产物。
- 提交前再次运行 `git status --short`，确认暂存范围准确。

## 微信小游戏构建

在 Cocos Creator 3.8.4 中选择 `wechatgame` 平台，以 `Main.scene` 为启动场景并保持竖屏方向。

真实 AppID 必须在 Cocos Creator 或微信开发者工具中配置。游戏运行时输入、存储、剪贴板、资源加载、动画和 UI 使用 Cocos API 或经过保护的微信 API，不依赖 DOM 游戏层。
