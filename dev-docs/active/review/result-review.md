# 结果评审：当前实现是否已经可自动进行报名

## 结论

当前实现已经具备“执行自动报名”的代码路径，但**还不能认定为已经满足可稳定自动报名的交付标准**。

原因不是登录和抓取失败，而是还有两项验收闭环没有完成：

1. 真实站点上的“报名按钮点击 -> 页面反馈 -> 结果判定”还没有做现场验证。
2. 真实站点上的“已预约次数 / 次数要求”虽然已人工确认存在，但主工作流还没有稳定读取并用于最终停止判断。

因此，当前状态更准确的表述是：**已经可以自动登录、自动进入讲座预告页、自动筛选候选讲座；但自动报名能力仍处于“代码已实现、线上未闭环验证”的阶段。**

## 主要发现

### 1. 自动报名动作尚未在真实站点闭环验证

`src/workflow.ts` 已经在非 `dry-run` 模式下调用 [src/register.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/register.ts#L8) 执行点击，因此从代码结构上看，系统确实具备“自动报名”的执行路径。

但当前 `result.md` 明确写明“未执行真实报名点击，因此还没有验证报名动作后的结果提示和弹窗链路”，这意味着 `SPEC.md` 中“在非 dry-run 模式下执行报名并记录结果”的验收项还没有被真实站点验证。

这一点对应：

1. [src/workflow.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/workflow.ts#L117)
2. [src/register.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/register.ts#L8)
3. [result.md](/Users/zhuyanbo/PycharmProjects/sep-assign/dev-docs/active/result.md#L43)
4. [SPEC.md](/Users/zhuyanbo/PycharmProjects/sep-assign/dev-docs/active/SPEC.md#L43)

影响：当前程序在技术上“可能会去点报名”，但还不能证明它在真实站点上会稳定得到正确结果，不误判成功、失败或已预约状态。

### 2. 次数停止条件尚未接入真实运行闭环

当前代码已经尝试在主流程中先读讲座预告页、再回退到“报名及听课记录”页补次数信息；这条路径在代码里是存在的：

1. [src/workflow.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/workflow.ts#L41)
2. [src/lecture-page.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/lecture-page.ts#L59)
3. [src/quota.ts](/Users/zhuyanbo/PycharmProjects/sep-assign/src/quota.ts#L3)

但 `result.md` 已经记录：真实站点上人工能看到“累计听讲座 8 次，其中有效 6 次”“有效记录 15 次及以上”，而主工作流的 summary 仍然输出 `quotaBooked: null`、`quotaRequired: null`。这说明“读取真实次数并用于停止判断”的验收项并未完成闭环。

这一点对应：

1. [result.md](/Users/zhuyanbo/PycharmProjects/sep-assign/dev-docs/active/result.md#L45)
2. [SPEC.md](/Users/zhuyanbo/PycharmProjects/sep-assign/dev-docs/active/SPEC.md#L42)

影响：如果直接切到真实报名模式，系统可能在已经达到听讲要求后仍继续尝试报名，违背当前 spec 中的自动停止要求。

## 完成度评估

已经完成并经过真实站点验证的部分：

1. SEP 登录成功。
2. 必须通过 SEP 门户“人文讲座报名”入口建立 `xkcts` 会话这一真实路径已经确认。
3. 讲座预告页可以稳定打开。
4. 时间筛选逻辑已经在真实页面上跑通，并能筛出候选讲座。
5. 已预约类状态文案已经在真实页面上确认并纳入识别。

尚未完成闭环的部分：

1. 非 `dry-run` 真实点击报名。
2. 点击后的弹窗、结果提示和状态刷新验证。
3. 次数页统计值接入主流程并触发自动停止。
4. 验证码真实样本验证。

## 质量评估

当前质量水平适合定义为“可继续现场联调的 beta 状态”，不适合定义为“已经可放心自动报名的完成态”。

优点：

1. 登录、SSO 和讲座列表抓取已被真实站点验证。
2. 当前问题已经从“无法访问站点”收缩到很具体的报名闭环和次数字段闭环。
3. 代码结构已经分层，继续调试不会需要整体推翻。

不足：

1. 最关键的真实副作用动作，也就是报名点击，还没有做线上验证。
2. 停止条件与真实站点统计页之间仍有脱节。

## 建议的下一步

1. 在 `--headful --no-dry-run` 模式下，对当前唯一候选讲座做一次受控的真实报名验证，重点记录点击后的页面反馈、是否弹窗、是否跳页，以及是否出现“已经预约过”或成功提示。
2. 对“报名及听课记录”页做一次单独的主流程调试，直到 `app.summary` 中能稳定输出真实 `quotaBooked` / `quotaRequired`。
3. 只有在上述两点完成后，才把“当前实现可以自动进行报名”作为最终结论写回权威执行结果文档。
