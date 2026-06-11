# MBTI 小镇演化逻辑加固计划

## 背景

当前演化链路已经能完成创建实验、生成小镇、触发事件、推动对话、展示证据和生成结论。但事件、对话、证据三套逻辑仍主要靠时间窗和前端启发式关联，导致证据错配、事件缺证据、历史不完整、最终结论采样不足等问题。

## 阶段 1：事件状态与证据事实表

状态：已完成。已新增后端证据事实表，事件触发、事件补话、用户行为会写入事件证据；前端事件证据展示优先使用后端证据。

目标：让事件证据成为后端事实，而不是前端临时筛选结果。

涉及文件：
- `convex/schema.ts`
- `convex/mbti.ts`
- `convex/messages.ts`
- `src/components/mbti/eventProgress.ts`
- `src/components/mbti/MbtiExperiment.tsx`

工作内容：
- 扩展事件状态：`seeded`、`moving`、`conversation_pending`、`triggered`、`observed`、`resolved`、`failed`。
- 新增 `mbtiEventEvidence` 表，记录 message/thought/behavior/social_event 归属到哪个事件、匹配原因、发生时间和文本摘要。
- 事件触发、事件补话、用户行为记录时同步写入证据表。
- `getExperiment` 返回证据表，前端事件卡片优先使用后端证据。

验证：
- `npx tsc -p convex/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm test -- --runTestsByPath src/components/mbti/eventProgress.test.ts`

回滚：
- 保留前端现有启发式筛选作为 fallback，直到后端证据稳定。

## 阶段 2：对话调度不再无条件打断

状态：已完成。`ensureMbtiFocusConversation` 遇到 60 秒内仍活跃且已有消息的参与人对话时返回 `participant-busy`，不再直接结束原对话。

目标：减少“一句话历史对话”和主线被系统强行切碎的问题。

涉及文件：
- `convex/aiTown/agentInputs.ts`
- `convex/mbti.ts`
- `convex/aiTown/conversation.ts`

工作内容：
- `ensureMbtiFocusConversation` 不再无条件结束参与人已有对话。
- 如果参与人已在一段可用对话里，优先把事件挂到当前对话。
- 只有在对话无关、超时、无消息或事件缺证据时才打断重建。
- 给打断动作写入原因，方便调试。

验证：
- 创建一轮长时实验，观察历史对话是否明显减少碎片。
- 事件触发后至少保留最小往返。

回滚：
- 保留原始强制聚焦作为 fallback 分支，但默认不使用。

## 阶段 3：最终报告按事件聚合

状态：已完成。最终报告 prompt 已按 `mbtiEvents` 聚合 `mbtiEventEvidence`，全局最近聊天只作为事件证据不足时的兜底参考。

目标：最终结论覆盖完整事件链，而不是全局取最近若干条。

涉及文件：
- `convex/mbti.ts`

工作内容：
- 构建 `collectEventEvidenceSummary`，按每个 `mbtiEvents` 聚合证据。
- 报告 prompt 改为按事件传入：计划、触发时间、聊天证据、行为证据、缺失状态。
- fallback report 也基于事件覆盖率，而不是全局 message 数。

验证：
- 长时演化后报告能说明哪些事件有证据、哪些缺证据。
- 不再把 unrelated daily/pacing 事件当主线证据。

回滚：
- 保留当前 deterministic report 作为兜底。

## 阶段 4：历史保留分层

目标：清理 world 数据时保留可追溯摘要。

涉及文件：
- `convex/schema.ts`
- `convex/mbti.ts`
- `convex/crons.ts`

工作内容：
- 新增轻量 `mbtiExperimentSummaries` 或复用实验 report，保存问题、角色、事件摘要、证据摘要和结论。
- 清理 world/messages 时不删除摘要。
- 历史列表优先展示摘要；仍在运行的实验进入观察界面，已结束实验展开结论。

验证：
- 手动运行 cleanup 后，历史摘要仍可读。

回滚：
- 不改变已有清理入口，只新增保留层。

## 阶段 5：运行可观测性和健康检查

目标：快速判断问题在 heartbeat、engine、事件调度、对话生成还是证据归因。

涉及文件：
- `convex/mbti.ts`
- `src/components/mbti/MbtiExperiment.tsx`

工作内容：
- 后端返回每个事件的状态、最后调度时间、失败原因、证据数。
- 前端观察页展示 engine 状态、事件状态计数、最近失败原因。
- 增加 debug query 但仅保留安全摘要，不暴露敏感 prompt。

验证：
- 停掉 LLM 或制造无参与者事件时，页面能显示具体原因。

## 执行顺序

先执行阶段 1。原因：证据事实表是后续报告、展示、历史保留和健康检查的共同基础。

主要风险：
- Convex schema 扩展会影响生成类型，需要同步修复所有 status 类型分支。
- 新证据表写入如果重复，需要幂等键或重复检测。

当前假设：
- 可以接受新增表，不需要迁移已有历史实验。
- 当前已有前端启发式证据展示可作为 fallback，避免一次性切换造成空白。
