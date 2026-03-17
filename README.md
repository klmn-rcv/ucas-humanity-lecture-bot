# UCAS 人文讲座自动报名工具

这个项目使用 `Playwright + TypeScript + Tesseract.js` 自动访问国科大 SEP/选课系统，抓取人文讲座列表，并按照固定规则筛选后尝试报名。

## 当前实现范围

工具当前覆盖以下能力：

1. 自动登录 SEP 门户。
2. 如果登录页启用了图形验证码，自动检测验证码输入框与图片，并使用 OCR 识别后填写。
3. 进入人文讲座列表页，提取讲座标题、开始时间、地点、报名状态与次数信息。
4. 只保留以下时间窗口内的讲座：
   - 周一 17:00 及以后
   - 周二 19:00 及以后
   - 周三任意时间
5. 读取页面中的“已预约次数 / 次数要求”，达到要求后自动停止报名。
6. 把“已预约”和“人数已满”的讲座记录到本地状态文件，后续运行直接跳过。
7. 支持 `dry-run` 模式，只输出候选讲座，不执行真实报名。

## 安装

```bash
npm install
npx playwright install chromium
```

## 配置

复制 `.env.example` 为 `.env`，至少填写：

```env
UCAS_USERNAME=你的用户名
UCAS_PASSWORD=你的密码
UCAS_DRY_RUN=true
```

常用配置项：

1. `UCAS_STATE_PATH`: 本地状态文件路径，默认 `.cache/lecture-state.json`
2. `UCAS_CAPTCHA_ENABLED`: 是否启用验证码识别，默认 `true`
3. `UCAS_CAPTCHA_MAX_ATTEMPTS`: 验证码识别最大尝试次数，默认 `3`
4. `UCAS_POLL_INTERVAL_MS`: 轮询间隔，默认 `0`
5. `UCAS_MAX_CYCLES`: 最大轮询次数，默认 `1`

## 运行

只做抓取和判定：

```bash
npm start -- --dry-run
```

执行真实报名：

```bash
npm start -- --no-dry-run
```

显示浏览器窗口便于调试：

```bash
npm start -- --headful --dry-run
```

## 日志与状态文件

程序输出 JSON 行日志，适合后续重定向到文件分析。状态文件会记录：

1. 已预约讲座
2. 人数已满讲座
3. 最近一次读取到的预约次数信息

## 验证码说明

当前验证码实现依赖本地 OCR。由于真实验证码样式尚未在当前仓库中采集到，建议首次使用时打开 `--headful`，观察验证码图片是否清晰、OCR 是否稳定，并根据日志判断是否需要增加重试次数。

## 测试

```bash
npm test
npm run typecheck
```
