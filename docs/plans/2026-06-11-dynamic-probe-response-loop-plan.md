# MBTI 小镇动态情境探针与用户回应闭环改造计划

> Direction note, 2026-06-12: This plan is superseded as the main product direction by
> `2026-06-12-autonomous-living-town-plan.md`. Keep the useful infrastructure here
> (`eventPlans`, `mbtiEvents`, `mbtiUserResponses`, evidence separation, confidence
> labels), but do not continue expanding per-event user choice or questionnaire-like
> response coverage. Runtime user input should become rare calibration at critical
> uncertainty points.

## 背景

当前 MBTI 小镇已经具备入镇前问题规划、事件计划、事件触发、证据记录和最终报告能力。现有 `questionFocus.eventPlans` 已经包含观察轴、信息目标和判断信号，说明系统不是从零开始。

但当前核心风险仍然存在：

- 事件容易退化为通用小镇生活阻碍，和用户原始问题只有弱关联。
- 系统仍可能用 LLM 生成的“我”的回应作为用户反应证据。
- 事件一旦生成后缺少基于用户回应和修正的动态调整。
- 长时演化如果要求用户实时守候，会造成过高使用成本。
- 用户回应不足时，报告需要明确降低可信等级，而不是伪装成完整结论。

本计划目标不是推翻 AI Town，而是把 AI Town 的角色从“替用户生活”调整为“把用户真实选择放进情境中，展开后果、压力和反事实”。

## Goal

- Desired outcome:
  - 将系统重构为“用户问题 -> 候选假设 -> 情境探针池 -> 用户关键回应 -> 决策状态更新 -> 动态选择下一探针 -> 阶段总结/修正 -> 条件化报告”的闭环。
  - MBTI 作为先验，只影响探针风格、冲突维度和表达方式，不直接决定最终结论。
  - AI Town 负责呈现事件、NPC 压力、时间后果和反事实，不替用户做关键选择。

- Success checks:
  - 每个关键事件都能说明它测试哪个用户问题变量、关联哪些候选假设、需要什么用户回应。
  - 报告能区分用户真实回应、MBTI 先验、系统推理和缺失证据。
  - 用户可以异步批量处理关键回应；不需要守在电脑前等实时事件。
  - 用户未完成关键回应时，系统仍可生成阶段报告，但明确标注“基于有限信息，仅供参考”。

- Main constraint:
  - 第一阶段不要追求完整自动长期演化。先做可信的“情境卡片 + 用户回应 + 阶段校准”闭环，再逐步增强小镇沉浸感。

## Product Rules

1. 系统不会替用户完成关键回应。
2. LLM 生成的“我”的台词只能作为剧情占位，不能作为用户真实证据进入核心结论。
3. 情境探针必须和用户原始问题的关键不确定性有实质关联。
4. 动态演化不等于实时打断用户；关键回应进入待处理队列，用户回来后批量处理。
5. 用户回应不足时，报告必须降级为阶段性参考结论。
6. 每次阶段总结都允许用户确认、修正或补充现实约束。

## Resident Participation Model

小镇居民必须真实参与用户这次演化之旅，但参与方式不是“居民替用户回答问题”，也不是“居民围着用户给建议”。居民的作用是把抽象探针变成社会情境、现实压力、不同立场和延迟后果。

居民参与需要满足四个条件：

1. 每个关键探针都要指定居民参与功能。
   - 支持者：放大机会、鼓励行动，测试用户是否被正反馈推动。
   - 反对者：提出风险、责任或关系压力，测试用户是否动摇。
   - 现实约束者：代表钱、时间、资源、合同、家庭责任等现实条件。
   - 替代方案提供者：给出第三条路，测试用户是否只在二选一里纠结。
   - 未来后果见证者：展示选择延迟后果，测试用户是否能承受长期代价。

2. 居民发言必须绑定探针变量。
   - 不允许只闲聊、安慰或泛泛分析。
   - 每段关键居民互动都要能追溯到 `testedVariable`、`testedHypotheses` 或 `expectedSignals`。

3. 居民只能制造压力、信息、诱惑、反对和后果，不能替用户完成关键选择。
   - 用户关键选择仍由 `mbtiUserResponses` 记录。
   - 居民观点可进入证据上下文，但不能被当作用户偏好。

4. 居民参与要产生可引用证据。
   - 哪个居民参与了哪个探针。
   - 他代表什么现实力量或立场。
   - 用户是否回应、接受、反驳、回避或修正。
   - 这些互动如何改变下一轮探针。

示例：

```text
用户问题：我要不要辞职？

探针变量：autonomy_vs_stability
居民 A（现实约束者）：提醒房租、现金流和医保连续性。
居民 B（支持者）：强调新机会的自主性和成长空间。
居民 C（替代方案提供者）：提出先谈判项目主导权。

用户回应不是“居民说得对”，而是：
我更接近哪种选择？为什么？确定程度多少？哪个条件会让我改变？
```

## Phase 1: 探针数据结构与问题关联加固

- Objective:
  - 把“事件”正式升级为“情境探针”，让每个探针可解释、可追踪、可用于报告。

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbtiTownPlanner.ts`
  - `convex/mbti.ts`
  - `src/components/mbti/MbtiExperiment.tsx`

- Work items:
  - 扩展或新增 probe 数据结构，记录：
    - `probeId`
    - `testedVariable`
    - `testedHypotheses`
    - `scenarioText`
    - `expectedSignals`
    - `questionLink`
    - `informationGoal`
    - `biasDirection`
    - `residentRoles`
    - `residentParticipationGoal`
    - `status`
  - 让入镇前 planner 先输出候选假设和关键变量，再生成探针池。
  - 将当前 `eventPlans.observationAxis / informationGoal / judgmentSignal / questionLink` 映射到正式探针字段。
  - 为每个关键探针规划 1-3 个居民参与功能，说明居民代表的立场、制造的压力或提供的信息。
  - 前端事件卡片展示“这个事件在测试什么”，但避免露出过重的研究术语。

- Dependencies:
  - 需要保持现有 `mbtiEvents` 兼容，避免一次性迁移所有事件逻辑。

- Verification:
  - `npx tsc -p convex/tsconfig.json --noEmit`
  - `npx tsc --noEmit`
  - 手动创建 3 类问题：辞职、关系、创业，检查探针是否分别测试真实关键变量，而不是通用生活阻碍。

- Rollback or containment:
  - 保留现有 `mbtiEvents.description` 作为 fallback。新 probe 字段缺失时仍可展示旧事件。

## Phase 2: 用户关键回应成为一等证据

- Objective:
  - 让用户本人对关键探针进行选择、打分、补充和修正，替代“LLM 替用户回应”的核心证据链。

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbti.ts`
  - `convex/messages.ts`
  - `src/components/mbti/MbtiExperiment.tsx`
  - `src/components/mbti/types.ts`

- Work items:
  - 新增 `mbtiUserResponses` 表，记录：
    - `experimentId`
    - `probeId` 或 `mbtiEventId`
    - `selectedOption`
    - `confidence`
    - `emotions`
    - `freeText`
    - `scenarioFit`
    - `correctionText`
    - `createdAt`
  - 每个关键探针触发后，前端显示回应卡片：
    - 选择项
    - 确定程度 1-7
    - 情绪反应
    - 自由补充
    - “这个情境不符合我”的入口
  - 后端报告生成时优先读取 `mbtiUserResponses`，而不是 AI 对“我”的模拟台词。
  - 现有 LLM 生成的用户回复标记为 `simulated_user_placeholder`，不能计入高可信证据。

- Dependencies:
  - Phase 1 至少需要给每个关键事件一个稳定 id 和测试目标。

- Verification:
  - 用户未回应时，报告显示缺少关键证据。
  - 用户回应后，事件证据链显示“来自用户真实回应”。
  - 回归检查现有消息/事件展示不空白。

- Rollback or containment:
  - 若回应表或 UI 出错，仍可回落到现有事件证据展示，但报告可信等级必须降低。

## Phase 3: 决策状态与动态探针选择

- Objective:
  - 让情境探针不是固定剧本，而是根据用户回应、已确认约束和仍不确定变量动态选择下一步。

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbti.ts`
  - `convex/mbtiTownPlanner.ts`
  - 新增 `convex/mbtiDecisionState.ts` 或拆分模块

- Work items:
  - 新增或嵌入 `decisionState`：
    - `activeHypotheses`
    - `resolvedVariables`
    - `uncertainVariables`
    - `confirmedConstraints`
    - `sensitiveConditions`
    - `responseCoverage`
    - `lastUserCorrection`
  - 每次用户回应后更新状态：
    - 哪些假设升权/降权
    - 哪些变量已基本确认
    - 哪些变量仍缺证据
    - 是否需要新探针
  - 探针选择规则：
    - 优先选择能区分高置信度竞争假设的探针。
    - 不重复测试已确认变量。
    - 用户修正改变核心解释时，生成校准探针。
  - 初期用简单规则实现，不要一开始做复杂贝叶斯或全自动 agent。

- Dependencies:
  - 需要 Phase 2 的真实用户回应作为状态更新输入。

- Verification:
  - 用户连续选择“自主性高于收入”后，系统不再反复测试收入 vs 自主，而转向执行负担、家庭压力、主导权代价。
  - 用户补充现实约束后，下一轮探针能围绕该约束生成。

- Rollback or containment:
  - 保留初始探针池顺序作为 fallback。动态选择失败时按计划顺序继续，但报告标注动态调整不可用。

## Phase 4: 异步关键回应队列

- Objective:
  - 解决长时演化要求用户守在电脑前的问题。动态过程保留，但用户交互改成批量、异步、可暂停。

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbti.ts`
  - `src/components/mbti/MbtiExperiment.tsx`
  - `src/components/mbti/MbtiExperiment.css`

- Work items:
  - 为关键探针增加待回应状态：
    - `pending_user_response`
    - `responded`
    - `skipped`
    - `expired_to_stage_report`
  - 前端新增“待回应关键节点”区域，用户回来后可一次处理 2-5 个。
  - 小镇可以继续生成 NPC 观点、背景事件和后果摘要，但不能替用户完成关键选择。
  - 支持三种节奏：
    - 快速澄清：一次回答 3-5 个探针，直接阶段结论。
    - 分阶段演化：每轮回答 2-3 个探针，系统后台演化后再请求下一批。
    - 沉浸小镇：用户在线时实时触发，离线时关键节点暂停。

- Dependencies:
  - Phase 2 用户回应表。
  - Phase 3 状态更新可先用简版。

- Verification:
  - 用户离开后回来，能看到待回应列表。
  - 未回应关键节点不会被系统自动填答案。
  - 已回应节点能从待处理列表移除并更新报告证据等级。

- Rollback or containment:
  - 默认先只支持“快速澄清”和“分阶段演化”。沉浸模式可继续使用现有实时流程，但标记为实验能力。

## Phase 5: 阶段总结、用户修正与报告可信等级

- Objective:
  - 把“用户确认/修正”变成正式闭环，并在报告中明确证据等级。

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbti.ts`
  - `src/components/mbti/MbtiExperiment.tsx`

- Work items:
  - 每 2-3 个关键回应后生成阶段总结：
    - 系统目前理解
    - 支持证据
    - 反向证据
    - 缺失证据
    - 当前条件边界
  - 用户可以选择：
    - 准确
    - 部分准确
    - 不准确
    - 补充现实约束
    - 事件不符合真实情况
  - 根据修正类型处理：
    - 小修正：更新解释，继续当前路线。
    - 中修正：插入校准探针。
    - 大修正：重新生成假设和探针池。
  - 报告分级：
    - Level 0：问题解析，仅有输入和 MBTI。
    - Level 1：初步倾向，少量关键回应。
    - Level 2：阶段结论，覆盖多个变量但未充分校准。
    - Level 3：稳健结论，多轮回应并经过确认/修正。
  - 回应不足时固定提示：
    - “该结论基于有限信息生成，尚缺若干关键回应，仅供参考。”

- Dependencies:
  - Phase 2 和 Phase 3。

- Verification:
  - 用户没有回应时只能得到 Level 0 或 Level 1。
  - 用户完成多轮回应并确认后，报告升级到 Level 3。
  - 报告中能看到“哪些来自用户真实回应，哪些来自系统推理，哪些仍缺证据”。

- Rollback or containment:
  - 保留当前 `report.limits` 字段，先把可信等级和缺失证据写入现有报告结构，再考虑拆独立 report schema。

## Phase 6: 小镇演化增强

- Objective:
  - 在可信闭环稳定后，再增强 AI Town 的沉浸价值：后果、NPC 压力、反事实和时间推进。

- Likely files or systems:
  - `convex/mbti.ts`
  - `convex/aiTown/agentInputs.ts`
  - `convex/agent/conversation.ts`
  - `src/components/mbti/MbtiExperiment.tsx`

- Work items:
  - 给 NPC 绑定功能角色：
    - 现实主义者：风险、钱、时间成本。
    - 理想主义者：意义、自主、长期愿景。
    - 关系压力者：家人、伴侣、同事、朋友。
    - 未来自己：延迟后果。
    - 旧环境代表：留下的诱惑和代价。
  - 将居民参与写入探针执行上下文：
    - 当前居民代表的现实力量。
    - 居民应该施加的压力或提供的信息。
    - 居民互动要测试的用户反应。
    - 居民互动不能越界替用户决策。
  - 事件触发时按探针需要选择居民，而不是只按地图位置或随机居民介入。
  - 记录居民参与证据：
    - `probeId` 或 `mbtiEventId`
    - `residentId`
    - `participationRole`
    - `stance`
    - `messageSummary`
    - `userReactionSignal`
  - 用户关键选择后，小镇演化：
    - 外部后果
    - NPC 反应
    - 反事实世界线
    - 条件变化
  - 小镇演化结果反过来生成下一批待回应探针，但不替用户做关键选择。

- Dependencies:
  - 前五阶段已经能证明证据链可信。

- Verification:
  - 同一个初始问题，不同用户回应会触发不同后续探针和小镇压力。
  - NPC 观点能映射到测试变量，不只是闲聊。
  - 报告证据能说明“哪个居民代表什么现实力量、用户如何回应”，且不把居民观点误当成用户观点。

- Rollback or containment:
  - 若小镇演化发散，降级为情境卡片版探针，保留用户回应和报告闭环。

## Implementation Order

推荐执行顺序：

1. Phase 1：先把事件升级为可解释探针。
2. Phase 2：让用户回应成为一等证据。
3. Phase 5 的报告可信等级可提前插入，防止过渡期报告误导。
4. Phase 3：再做动态探针选择。
5. Phase 4：补异步回应队列。
6. Phase 6：最后增强小镇沉浸演化。

最快可验证切片：

- 新增 `mbtiUserResponses`。
- 在现有事件卡片下方加一个用户回应表单。
- 报告中显示“真实用户回应数 / 关键探针数 / 可信等级”。
- 未回应时明确提示“仅供参考”。

## Current Implementation Status

截至 2026-06-11，本计划已完成一个可验证的主干切片：

- Phase 1 已落地主体：`mbtiEvents` 已加入探针元数据，包括 `testedVariable`、`testedHypotheses`、`questionLink`、`informationGoal`、`expectedSignals`、`biasDirection`、`probeOrigin`、`residentRoles` 和 `residentParticipationGoal`。事件卡片和报告会展示事件测试目标与居民参与目标。
- Phase 2 已落地主体：新增 `mbtiUserResponses`，用户可以对关键事件提交真实回应、确定度、情绪、自由补充、情境贴合度和修正文案。报告生成会优先读取真实用户回应。
- Phase 3 已落地简版：`decisionState` 会根据真实回应更新已确认变量、仍不确定变量、确认约束、敏感条件和回应覆盖度；用户修正或仍有不确定变量时会生成自适应或校准探针。
- Phase 4 已落地主体：事件状态支持 `pending_user_response`、`responded`、`skipped`、`expired_to_stage_report`，前端提供待回应关键节点队列和跳过入口。未回应不会由系统自动补答案。
- Phase 5 已落地主体：报告包含 `evidenceLevel`、真实回应数、所需回应数、缺失回应数和可信度提示。回应不足时会明确提示“可能不够准确，仅供参考”。
- Phase 6 已完成第一步：初始探针和动态探针会分配居民参与功能；动态探针会优先绑定本次小镇中已选择的真实居民姓名参与事件触发。居民参与证据表、反事实世界线和长期后果链仍属后续工作。

本轮验证命令：

```bash
npx convex codegen
npx tsc --noEmit
npx tsc -p convex/tsconfig.json --noEmit
npm test -- --runInBand --forceExit
npm run build
git diff --check
```

## Risks

- Highest execution risk:
  - 如果继续把 LLM 生成的“我”的回复混入用户真实证据，系统会看起来很完整，但结论可信度仍然虚高。

- Assumption that could break the plan:
  - 当前 Convex schema 和前端状态可以接受新增用户回应表、探针状态和报告等级字段。如果不想新增表，至少需要把这些字段嵌入 `mbtiExperiments`，但长期会难维护。

- Follow-up work:
  - Phase 1-5 稳定后，再做 with/without MBTI 对照、事件平衡审计、长期用户偏好记忆和跨问题行为模型。
