# UCAS 人文讲座自动报名工具

这个项目使用 `Playwright + TypeScript` 自动登录国科大 SEP / 选课系统，抓取人文讲座列表，按个人配置的时间条件筛选候选讲座，并在需要时自动报名。

当前版本支持：

1. 自动登录 SEP，并通过门户入口建立人文讲座系统会话。
2. 自动抓取讲座列表、识别“已预约 / 人数已满”等终态。
3. 读取已预约次数与总次数要求，达到要求后自动停止。
4. 通过配置文件定义时间筛选规则。
5. 通过配置文件开启“每天 8:00 到 18:00 每小时巡检一次”的定时模式。
6. 在出现图形验证码时自动识别；如果触发新设备邮箱验证，支持在 `headful` 模式下等待人工完成。

## 环境要求

1. Node.js `>= 22`
2. `npm`
3. Playwright Chromium 浏览器

安装依赖：

```bash
npm install
npx playwright install chromium
```

可选增强：

1. 如果你在校外网络下经常遇到验证码，可以额外准备一个本地 Python 环境并安装 `ddddocr`。
2. 当前项目会在检测到 `.venv-ddddocr/bin/python` 存在时自动启用该 OCR 候选；没有该环境时也能运行，只是验证码识别完全依赖 `tesseract.js`。

## 配置方式

项目使用双层配置：

1. `.env`：只存敏感信息，例如账号密码。
2. `ucas-bot.config.json`：存非敏感运行配置，例如运行模式、巡检时间和筛选规则。

### 1. 创建 `.env`

复制模板：

```bash
cp .env.example .env
```

填写账号密码：

```env
UCAS_USERNAME=your_ucas_username
UCAS_PASSWORD=your_ucas_password
```

如果你想把公开配置文件放到其他路径，也可以额外设置：

```env
UCAS_CONFIG_PATH=./ucas-bot.config.json
```

### 2. 创建配置文件

复制模板：

```bash
cp ucas-bot.config.example.json ucas-bot.config.json
```

默认模板包含以下几类配置：

1. `logging`：日志级别。
2. `targets`：SEP 登录地址和讲座页地址。
3. `runtime`：运行模式、`dryRun`、是否显示浏览器、状态文件路径、定时巡检设置。
4. `captcha`：验证码识别开关与重试上限。
5. `filter`：时间筛选规则。

## 运行方式

### 单次运行

按配置文件执行一次：

```bash
npm start
```

临时只做候选输出，不执行真实报名：

```bash
npm start -- --dry-run
```

临时执行真实报名：

```bash
npm start -- --no-dry-run
```

临时显示浏览器窗口：

```bash
npm start -- --headful
```

如果你用了自定义配置文件路径：

```bash
npm start -- --config ./path/to/ucas-bot.config.json
```

### 定时巡检模式

把配置文件中的 `runtime.mode` 改成 `scheduled`：

```json
{
  "runtime": {
    "mode": "scheduled",
    "headless": true,
    "dryRun": false,
    "schedule": {
      "startHour": 8,
      "endHour": 18,
      "intervalMinutes": 60,
      "runImmediatelyOnStart": true
    }
  }
}
```

含义如下：

1. 程序会在每天 `08:00-18:00` 之间按配置的间隔调度。
2. 默认模板使用 `60` 分钟间隔，也就是每小时检查一次。
3. 在巡检过程中发现新的符合条件讲座时，会按 `dryRun` 配置决定是仅输出候选，还是自动报名。
4. 进程不会在单轮完成后退出，而是持续等待下一次巡检时刻。

## 时间筛选规则配置

当前版本仅支持“按时间过滤”。

模板中的默认规则等价于：

1. 周一 `17:00` 及以后允许。
2. 周二 `19:00` 及以后允许。
3. 周三全天允许。

配置示例：

```json
{
  "filter": {
    "timeWindows": [
      { "weekday": 1, "start": "17:00" },
      { "weekday": 2, "start": "19:00" },
      { "weekday": 3 }
    ]
  }
}
```

字段说明：

1. `weekday`：使用 JavaScript 星期编号，`0=周日`，`1=周一`，`2=周二`，依此类推。
2. `start`：当天允许报名的最早时间，格式为 `HH:MM`。
3. `end`：可选，当天允许报名的最晚时间，格式为 `HH:MM`。

例如，如果你想改成“只允许周四 14:00-16:30”：

```json
{
  "filter": {
    "timeWindows": [
      { "weekday": 4, "start": "14:00", "end": "16:30" }
    ]
  }
}
```

## 校园网内如何运行

如果你在校园网内运行，通常更容易直接进入登录和讲座页，验证码出现概率也更低。推荐流程：

1. 先用 `dry-run` 验证配置是否正确：

```bash
npm start -- --dry-run
```

2. 如果日志正常、候选讲座符合预期，再把配置文件里的 `runtime.dryRun` 改成 `false`，或用：

```bash
npm start -- --no-dry-run
```

3. 如果你想长期挂着巡检，把 `runtime.mode` 改成 `scheduled`。

## 校园网外如何运行

如果你不在校园网内，可能出现两类额外情况：

1. 图形验证码
2. 新设备邮箱验证

推荐流程：

1. 第一次先用可见浏览器运行：

```bash
npm start -- --headful --dry-run
```

2. 如果出现图形验证码，程序会尝试自动识别并填写。
3. 如果跳到新设备验证页面，程序会在 `headful` 模式下保持窗口不关闭；此时需要你手动完成邮箱验证。
4. 完成一次新设备验证后，再重新运行同一命令确认是否能稳定回到讲座页。
5. 确认链路稳定后，再切换到真实报名或后台巡检模式。

注意：

1. 如果你在校外长期跑后台巡检，但当前网络环境经常触发新设备验证，那么纯后台 `headless` 模式并不可靠，因为邮箱验证必须人工完成。
2. 比较稳妥的做法是先用 `headful` 模式完成一次设备授权，再切到后台模式。

## 后台运行

后台运行前，建议先确认以下事项：

1. 配置文件已经设为 `scheduled` 模式。
2. 你已经至少成功做过一次本地前台验证。
3. 如果校外网络会触发邮箱验证，先用 `headful` 完成验证，再考虑后台运行。

### macOS / Linux

先准备日志目录：

```bash
mkdir -p logs
```

然后用 `nohup` 后台运行：

```bash
nohup npm start > logs/bot.log 2>&1 &
```

查看日志：

```bash
tail -f logs/bot.log
```

更长期的做法：

1. 你也可以用 `tmux` / `screen` 保持进程。
2. 如果要开机自启，建议自己再封装成 `systemd` 服务或 `launchd` 任务；当前仓库不会自动生成这些系统级文件。

### Windows PowerShell

先准备日志目录：

```powershell
New-Item -ItemType Directory -Force logs | Out-Null
```

然后后台启动：

```powershell
Start-Process -FilePath "npm.cmd" `
  -ArgumentList "start" `
  -WorkingDirectory (Get-Location) `
  -RedirectStandardOutput "logs\\bot.log" `
  -RedirectStandardError "logs\\bot.err" `
  -WindowStyle Hidden
```

查看日志：

```powershell
Get-Content .\logs\bot.log -Wait
```

更长期的做法：

1. 对于每天固定时间自动启动，建议使用“任务计划程序”。
2. 如果你希望开机自启，也建议通过任务计划程序或 NSSM 等工具自行包装；当前仓库不自动生成系统服务配置。

## 日志与状态文件

程序输出 JSON 行日志，适合重定向到文件或被其他日志工具读取。

状态文件默认是 `.cache/lecture-state.json`，主要保存：

1. 已预约讲座
2. 人数已满讲座
3. 最近一次读取到的预约次数信息

这意味着程序可以跨运行跳过已经确认是终态的讲座，避免重复点击。

## 测试

```bash
npm run typecheck
npm test
```

## 发布前注意事项

1. 不要提交 `.env`
2. 不要提交 `ucas-bot.config.json`
3. 不要提交 `.cache/`、日志目录和本地虚拟环境
4. 公开仓库应只保留 `.env.example` 和 `ucas-bot.config.example.json` 作为模板
