# 执行结果

## 完成情况

本轮 `sep-captcha-live-validation` 已完成。当前实现已经在真实出现验证码的 SEP 登录页上完成了验证码检测、截图、OCR 识别、回填与登录后续跳转的现场验证，并在此基础上新增了 `ddddocr` 原图识别候选，用于补强原先 `tesseract.js` 在真实样本上的精度不足问题。

## 本轮代码修正

1. 修正了验证码输入框选择器，避免隐藏字段 `#certCode` 抢占可见输入框 `#certCode1`。
2. 修正了 OCR 语言包加载方式：不再依赖当前环境下会触发证书链错误的 Node `fetch` 远程取包，而是先把 `eng.traineddata.gz` 下载到本地 `.cache/tessdata/`，再让 `tesseract.js` 从本地缓存读取。
3. 为 OCR 增加了显式缓存目录，避免 `eng.traineddata` 再落到仓库根目录。
4. 在登录流程中加入了“新设备 / 邮箱验证”页面识别与等待逻辑；在 `headful` 模式下，程序会保持窗口存活并等待人工完成验证，而不是立刻关闭浏览器。
5. 放宽了 SEP 门户中“人文讲座报名”入口的定位方式，并在失败时带出更完整的诊断信息。
6. 新增了 `scripts/ddddocr-experiment.py`，用于在 Python 虚拟环境里对缓存的真实验证码样本批量运行 `ddddocr`。
7. 在 `src/captcha.ts` 中新增了 `ddddocr-raw` 候选源：程序会在已保存的验证码原图上调用 `ddddocr`，并把结果与 `tesseract.js` 的整词识别、分割识别结果一起参与统一打分。
8. 验证码重试上限已经被配置校验硬限制为 5 次，避免过高重试次数触发站点风控。

## 离线样本验证

基于已缓存的真实验证码原图，`ddddocr` 的离线结果如下：

1. `2026-03-17T13-30-00-740Z-raw.png` 识别为 `gf3g`，与人工观察到的 `Gf3G` 基本一致。
2. `2026-03-17T13-30-33-698Z-raw.png` 识别为 `hyzv`，与人工观察到的 `HYzV` 基本一致。
3. `2026-03-17T13-41-37-737Z-raw.png` 识别为 `7x9q`，优于此前 `tesseract.js` 在该样本上给出的 `7X90`。
4. `2026-03-17T13-54-31-142Z-raw.png` 识别为 `xvfb`，与当次真实成功登录中接受的验证码一致。

从这批样本看，`ddddocr` 在真实原图上的整体命中率明显高于当前仅依赖 `tesseract.js` 的方案，因此本轮将其作为新的候选源接入主流程。

## 现场验证结果

已完成的真实验证：

1. 当前网络环境下，SEP 登录页会真实出现验证码。
2. 修正后，现场日志已稳定出现 `captcha.detected` 与 `captcha.solved`，说明验证码检测、截图和 OCR 已真实触发。
3. 在新设备验证首次出现时，程序已成功识别 `https://sep.ucas.ac.cn/user/userVisit` 页面中的“邮箱验证 / 手机号验证”界面，并进入 10 分钟等待窗口，浏览器不会被立即关闭。
4. 用户完成邮箱验证后，重新运行同一流程时，没有再次弹出新设备验证页面。
5. 在引入 `ddddocr` 之前，最近一次真实 `--headful --dry-run --log-level debug` 需要在第 2 次尝试才通过验证码并进入讲座页。
6. 在引入 `ddddocr` 之后，最新一次真实 `--headful --dry-run --log-level debug` 的第 1 次尝试就以 `variant=ddddocr-raw` 通过验证码，随后成功进入 SEP 门户、“人文讲座报名”入口和讲座页。
7. 最新一次真实回归的 `app.summary` 为：`candidateCount=0`、`skippedCount=6`、`attemptCount=0`、`quotaBooked=6`、`quotaRequired=15`。

## 本地验证

1. `npm run typecheck` 通过。
2. `npm test` 通过，当前共 12 个测试。
3. `.venv-ddddocr/bin/python scripts/ddddocr-experiment.py .cache/captcha/*-raw.png` 已成功批量输出样本识别结果。

## 剩余风险

1. `ddddocr` 当前依赖仓库内的 `.venv-ddddocr` Python 虚拟环境；如果在新环境下未安装该依赖，系统会自动退回到原有的 `tesseract.js` 候选路径。
2. 现有 `ddddocr` 结果主要来自本轮缓存的十张左右真实样本，样本规模仍然有限，还不能证明在长期运行下始终优于 `tesseract.js`。
3. 新设备验证属于 SEP 额外安全策略，未来仍可能在新的浏览器配置或新的网络环境下再次出现；当前实现只能在 `headful` 模式下等待用户手动完成，不会自动处理邮箱或短信验证码。
4. 讲座页当前仍会把表头计入 `lectureCount`，这不影响验证码专项目标，但仍是已知统计偏差。

## 建议的下一步

1. 如果后续再次切换网络环境或设备，继续观察 `ddddocr-raw` 在真实验证码上的命中率是否稳定保持在 1 到 2 次内登录成功。
2. 如果准备把该项目迁移到新机器，优先补一个初始化步骤，用于自动创建 `.venv-ddddocr` 并安装 `ddddocr`。
3. 如果未来积累到更多失败样本，可以考虑把 `ddddocr` 变成显式可配置后端，而不是当前的“有环境就启用”的增强候选源。
