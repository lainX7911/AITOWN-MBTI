# Scene Layout Director Plan

## 背景问题

当前 AI Town 演化页面的问题不只是地图不贴题，而是空间、角色、事件三者没有被统一编排：

- 设施像临时贴图，缺少占地、入口、间距和道路校验，容易显得丑陋、混乱或互相叠压。
- 用户、带入对象、常驻居民的出生点、移动路线、停留点和事件地点缺少关系，看起来像随机走动。
- eventPlans 写了剧情场景，但地图没有按剧情重排空间，也没有把角色调度到事件发生地。
- 常驻小镇的记忆和关系是有价值的，但视觉地图不应每轮完全推翻，否则会破坏“常驻”感。

## 方向原则

保留常驻小镇的居民、关系、记忆和历史连续性；每次用户入镇时，生成一份本轮临时场景布局计划。

也就是：

```text
常驻小镇 = 居民 / 关系 / 记忆 / 历史
本轮场景 = 问题 / 启动前校准 / eventPlans / 参与角色 / 地点编排
```

本轮场景不是“重新发明一个世界”，而是在已有地图资源和设施资产上做有约束的空间编排。

## 目标

建立 `Scene Layout Director`，在用户加入小镇时输出一份可执行的场景布局计划：

```ts
type SceneLayoutPlan = {
  theme: string;
  activeZones: string[];
  facilityPlacements: Array<{
    key: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    entrance: { x: number; y: number };
    stagingPoints: Array<{ x: number; y: number }>;
  }>;
  spawnPoints: Record<string, { x: number; y: number }>;
  eventRoutes: Array<{
    eventId: string;
    locationKey: string;
    participantRoles: string[];
    stagingPoint: { x: number; y: number };
  }>;
};
```

## 非目标

- 第一阶段不做 AI 像素级重绘地图。
- 第一阶段不做无限制自由生成地图。
- 不继续强化“用户逐事件选择”的路线。
- 不把事件卡片做成问卷主流程。
- 不破坏常驻居民、关系、记忆的连续性。

## 阶段 1：空间资产规范化

目标：先让设施摆放不乱。

任务：

- 梳理当前地图设施来源：
  - `data/townLayout.ts`
  - `data/gentle.js`
  - `convex/mbti.ts` 中 map 创建和 sceneLocationKey 使用
  - `convex/aiTown/agentInputs.ts` 中 placeAtSceneAnchor / placeNear / backgroundDestination
- 给每个设施定义 footprint：
  - `width`
  - `height`
  - `entrance`
  - `stagingPoints`
  - `allowedThemes`
- 建立基础校验：
  - 设施之间不能重叠
  - 入口不能被 object tile 或其他设施挡住
  - staging point 必须可站立
  - 用户、伴侣、居民 spawn point 不能重叠

验收：

- 地图上的咖啡馆、住宅、帐篷、箱子等不会互相压住。
- 每个设施至少有一个清晰入口。
- 角色不会出生在设施内部、河里、障碍物上或互相重叠。

## 阶段 2：本轮主题场景选择

目标：根据用户问题选择本轮需要的空间类型。

任务：

- 从 `questionFocus` / `eventPlans` 提取地点需求。
- 定义主题场景模板：
  - 亲密关系 / 择偶生活：老房、咖啡馆、河边步道、社区办公室、商店
  - 职业与钱：办公室、车站、商店、社区办公室、咖啡馆
  - 家庭责任：住宅、诊所、社区办公室、商店
  - 健康照护：诊所、河边步道、住宅、社区办公室
- 为每轮选择 3-5 个 activeZones，而不是把所有设施都堆出来。

验收：

- 用户问择偶时，地图重点出现生活/关系场景，而不是随机营地。
- 用户问职业或钱时，地图重点出现办公室、车站、商店等现实压力地点。
- 地图设施数量被控制，默认不超过 5 个主设施。

## 阶段 3：事件绑定地点和调度

目标：事件不再只是文本，而是驱动角色移动和停留。

任务：

- 给每个 eventPlan 增加或解析 `locationKey`。
- 每个事件生成：
  - stagingPoint
  - participantRoles
  - arrivalWindow
  - idleBehavior
- 事件触发前，把相关角色调度到对应地点。
- 事件结束后，角色根据关系/记忆/自治计划离开或停留。

验收：

- 事件发生前，相关角色能移动到对应地点。
- 用户看到的地图行为能解释事件为什么在这里发生。
- 不再出现“事件写咖啡馆，角色却都在瀑布旁边乱走”的割裂感。

## 阶段 4：临时本轮地图覆盖层

目标：保留底图，但本轮设施和事件点由布局计划控制。

任务：

- 在 map 渲染层支持 runtime facility overlay。
- 不直接修改常驻地图底图。
- SceneLayoutPlan 控制本轮设施可见性、标签、入口点和事件点。
- 历史常驻地点仍可作为背景，但不抢本轮事件视觉焦点。

验收：

- 同一个常驻小镇可以根据不同问题呈现不同本轮场景。
- 本轮结束后，常驻居民记忆保留，但临时设施布局不污染下一轮。

## 阶段 5：自动演化优先，用户只做关键校准

目标：空间编排服务自动演化，而不是服务逐事件问卷。

任务：

- eventPlans 作为后台扰动探针。
- 默认不展示未触发事件的用户选择表单。
- 只有当结论出现关键不确定节点时，才弹出少量校准问题。
- 校准问题应解释：“为什么现在需要你补充”，而不是让用户逐事件答题。

验收：

- 用户入镇前只需少量校准。
- 小镇运行中居民自动移动、对话、形成记忆。
- 用户不用守在电脑前逐项选择。
- 报告能区分：
  - 已由小镇自动观察得到的证据
  - 仍需用户校准的不确定点

## 推荐实施顺序

1. 先做设施 footprint 和防重叠校验。
2. 再做主题场景选择。
3. 再做 eventPlan -> locationKey -> stagingPoint。
4. 最后做 runtime facility overlay。

原因：如果没有 footprint 和可达点，直接做动态地图只会把混乱变成动态混乱。

## 风险

- 当前地图资源可能不足以表达“岳阳老房/社区/商店”等真实生活场景，需要先用已有 tile 组合近似表达。
- AI 生成 locationKey 容易不稳定，第一版应从固定地点枚举中选择。
- 如果设施 overlay 和 pathfinding 不同步，角色仍可能走到不可达位置。
- 如果每轮改动底图而不是使用临时覆盖层，会破坏常驻小镇连续性。

## 当前决策

下一步先做阶段 1，不做大规模 AI 地图生成。

优先目标是让当前地图看起来可信：

- 设施不重叠。
- 角色不乱站。
- 事件地点和角色路线一致。
- 本轮问题能反映到地图空间上。
