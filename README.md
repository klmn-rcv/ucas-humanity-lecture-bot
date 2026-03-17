# UCAS 人文讲座自动报名工具

这个项目使用 `Playwright + TypeScript + ddddocr` 自动登录国科大 SEP / 选课系统，抓取人文讲座列表，按个人配置的时间规则筛选讲座，并在命中条件时自动报名。

当前版本支持：

1. 自动登录 SEP，并通过门户入口建立人文讲座系统会话。
2. 自动处理图形验证码，验证码识别统一使用本地 `ddddocr`。
3. 自动抓取讲座列表，识别“已预约 / 人数已满 / 已结束”等状态。
4. 自动读取“累计听讲座次数 / 有效次数 / 总次数要求”，达到要求后停止报名。
5. 通过配置文件定义筛选时间段。
6. 通过配置文件开启“每天多个时间段内按固定间隔巡检”的运行模式。
7. 通过本地状态文件跳过已经确认终态的讲座，避免重复访问和重复报名。

## 环境要求

1. Node.js `>= 22`
2. `npm`
3. Python `>= 3.10`
4. Playwright Chromium 浏览器

安装 Node 依赖和浏览器：

```bash
npm install
npx playwright install chromium
```

## 安装 ddddocr

验证码识别现在只依赖 `ddddocr`，不再保留 `tesseract.js` 备用路径。因此第一次使用前需要准备本地 Python 环境。

### macOS / Linux

```bash
python3 -m venv .venv-ddddocr
. .venv-ddddocr/bin/activate
pip install -U pip
pip install ddddocr
```

### Windows PowerShell

```powershell
py -3 -m venv .venv-ddddocr
.\.venv-ddddocr\Scripts\Activate.ps1
python -m pip install -U pip
pip install ddddocr
```

如果你的 Python 可执行文件不在默认路径，可以在 `ucas-bot.config.json` 里通过 `captcha.pythonExecutable` 指定。

## 配置模型

项目使用两层配置，但两者不重复：

1. `.env`
   只放敏感信息，也就是账号和密码。
2. `ucas-bot.config.json`
   只放公开运行参数，也就是运行模式、时间段、验证码参数、日志级别和筛选条件。

结论很简单：`.env` 不是主配置文件，`ucas-bot.config.json` 才是。你平时要调整运行行为时，只改 `ucas-bot.config.json`；只有账号密码变化时才改 `.env`。

## 第一步：创建 `.env`

复制模板：

```bash
cp .env.example .env
```

填写真实账号密码：

```env
UCAS_USERNAME=your_ucas_username
UCAS_PASSWORD=your_ucas_password
```

## 第二步：创建 `ucas-bot.config.json`

复制模板：

```bash
cp ucas-bot.config.example.json ucas-bot.config.json
```

默认模板如下：

```json
{
  "logging": {
    "level": "info"
  },
  "targets": {
    "loginUrl": "https://sep.ucas.ac.cn/?loginFrom=/appStore",
    "lectureUrl": "https://xkcts.ucas.ac.cn:8443/subject/humanityLecture"
  },
  "runtime": {
    "mode": "single",
    "headless": true,
    "dryRun": true,
    "statePath": ".cache/lecture-state.json",
    "schedule": {
      "periods": [["08:00", "18:00"]],
      "intervalMinutes": 60,
      "runImmediatelyOnStart": true
    }
  },
  "captcha": {
    "enabled": true,
    "maxAttempts": 3,
    "pythonExecutable": ".venv-ddddocr/bin/python"
  },
  "filter": {
    "timeWindows": [
      {
        "weekday": 1,
        "periods": [["17:00", "23:59"]]
      },
      {
        "weekday": 2,
        "periods": [["19:00", "23:59"]]
      },
      {
        "weekday": 3,
        "periods": [["00:00", "23:59"]]
      }
    ]
  }
}
```

## 配置项说明

### `logging`

```json
{
  "logging": {
    "level": "debug"
  }
}
```

可选值：

1. `debug`
2. `info`
3. `warn`
4. `error`

### `targets`

```json
{
  "targets": {
    "loginUrl": "https://sep.ucas.ac.cn/?loginFrom=/appStore",
    "lectureUrl": "https://xkcts.ucas.ac.cn:8443/subject/humanityLecture"
  }
}
```

通常不需要改。只有站点入口地址变动时才需要覆盖。

### `runtime`

#### `runtime.mode`

```json
{
  "runtime": {
    "mode": "single"
  }
}
```

可选值：

1. `single`
   执行一轮后退出。
2. `scheduled`
   在配置的时间段内持续巡检。

#### `runtime.headless`

```json
{
  "runtime": {
    "headless": false
  }
}
```

`false` 表示显示浏览器窗口。第一次在校外网络使用时，建议先改成 `false`。

#### `runtime.dryRun`

```json
{
  "runtime": {
    "dryRun": true
  }
}
```

`true` 只抓取和筛选，不点击真实报名。  
`false` 会对命中的候选讲座执行真实报名尝试。

#### `runtime.statePath`

```json
{
  "runtime": {
    "statePath": ".cache/lecture-state.json"
  }
}
```

状态文件会记录：

1. 已预约讲座
2. 已满员讲座
3. 最近一次读到的次数统计

#### `runtime.schedule`

```json
{
  "runtime": {
    "mode": "scheduled",
    "schedule": {
      "periods": [
        ["08:00", "12:00"],
        ["14:00", "18:00"]
      ],
      "intervalMinutes": 60,
      "runImmediatelyOnStart": true
    }
  }
}
```

字段说明：

1. `periods`
   每个数组代表一个时间段，格式固定为 `["开始时间", "结束时间"]`。
2. `intervalMinutes`
   在这些时间段里按多少分钟巡检一次。
3. `runImmediatelyOnStart`
   如果程序启动时已经处于某个可运行时间段内，是否立刻先跑一轮。

这意味着你可以在一天内配置多个不连续时段。例如上面的例子会在 `08:00-12:00` 和 `14:00-18:00` 两段时间内每小时检查一次。

### `captcha`

```json
{
  "captcha": {
    "enabled": true,
    "maxAttempts": 5,
    "pythonExecutable": ".venv-ddddocr/bin/python"
  }
}
```

字段说明：

1. `enabled`
   是否启用验证码识别。
2. `maxAttempts`
   登录阶段最多尝试多少次验证码，当前硬上限是 `5`。
3. `pythonExecutable`
   用来执行 `ddddocr` 的 Python 路径。

Windows 示例：

```json
{
  "captcha": {
    "pythonExecutable": ".venv-ddddocr/Scripts/python.exe"
  }
}
```

### `filter.timeWindows`

当前版本只支持按时间过滤。

```json
{
  "filter": {
    "timeWindows": [
      {
        "weekday": 1,
        "periods": [["17:00", "23:59"]]
      },
      {
        "weekday": 2,
        "periods": [["19:00", "23:59"]]
      },
      {
        "weekday": 3,
        "periods": [["00:00", "23:59"]]
      }
    ]
  }
}
```

字段说明：

1. `weekday`
   JavaScript 星期编号，`0=周日`，`1=周一`，`2=周二`，依此类推。
2. `periods`
   该星期允许报名的时间段数组。每个时间段都写成 `["开始时间", "结束时间"]`。

你现在要求的默认筛选规则等价于：

1. 周一 `17:00-23:59`
2. 周二 `19:00-23:59`
3. 周三 `00:00-23:59`

如果你想改成“周二只看两个不连续时段，周三上午也看一段”，可以这样写：

```json
{
  "filter": {
    "timeWindows": [
      {
        "weekday": 2,
        "periods": [
          ["09:00", "11:00"],
          ["19:00", "21:30"]
        ]
      },
      {
        "weekday": 3,
        "periods": [["08:00", "12:00"]]
      }
    ]
  }
}
```

## 推荐运行方式

仓库已经封装了跨平台脚本。推荐优先使用脚本，而不是手敲 `npm start`。

### macOS / Linux

前台运行：

```bash
./scripts/run-bot.sh
```

只做 dry-run：

```bash
./scripts/run-bot.sh --dry-run
```

显示浏览器窗口：

```bash
./scripts/run-bot.sh --headful
```

真实报名：

```bash
./scripts/run-bot.sh --no-dry-run
```

### Windows PowerShell

前台运行：

```powershell
.\scripts\run-bot.ps1
```

只做 dry-run：

```powershell
.\scripts\run-bot.ps1 --dry-run
```

显示浏览器窗口：

```powershell
.\scripts\run-bot.ps1 --headful
```

真实报名：

```powershell
.\scripts\run-bot.ps1 --no-dry-run
```

## 校园网内如何操作

校园网内通常更容易直接登录 SEP，也更不容易触发验证码。推荐流程：

1. 先把 `runtime.dryRun` 设为 `true`，或者用 `--dry-run` 做一次验证。
2. 确认能正常进入讲座页，并且候选讲座符合预期。
3. 再切换到真实报名模式。
4. 如果要长期挂着巡检，把 `runtime.mode` 改成 `scheduled`。

一个典型的定时配置如下：

```json
{
  "runtime": {
    "mode": "scheduled",
    "headless": true,
    "dryRun": false,
    "schedule": {
      "periods": [["08:00", "18:00"]],
      "intervalMinutes": 60,
      "runImmediatelyOnStart": true
    }
  }
}
```

## 校园网外如何操作

校园网外可能遇到两类额外情况：

1. 图形验证码
2. 新设备邮箱验证

推荐流程：

1. 第一次先用可见浏览器运行：

```bash
./scripts/run-bot.sh --headful --dry-run
```

Windows：

```powershell
.\scripts\run-bot.ps1 --headful --dry-run
```

2. 如果出现验证码，程序会用 `ddddocr` 自动识别并填写。
3. 如果出现新设备邮箱验证，必须由你手工完成邮箱验证。
4. 程序在 `headful` 模式下会等待你完成验证；纯后台 `headless` 模式无法自动处理邮箱验证。
5. 完成一次设备授权后，再重新执行同一命令，确认已经能稳定进入讲座页。
6. 确认链路稳定后，再切换到真实报名或后台巡检模式。

## 后台运行

后台运行前，建议先完成一次前台验证，确认当前网络环境不会立刻触发你无法人工处理的二次验证。

### macOS / Linux

后台启动：

```bash
./scripts/run-bot-background.sh
```

带参数后台启动：

```bash
./scripts/run-bot-background.sh --headful
```

查看日志：

```bash
tail -f logs/bot.log
```

查看进程号：

```bash
cat logs/bot.pid
```

### Windows PowerShell

后台启动：

```powershell
.\scripts\run-bot-background.ps1
```

查看日志：

```powershell
Get-Content .\logs\bot.log -Wait
```

查看进程号：

```powershell
Get-Content .\logs\bot.pid
```

如果你想每天固定时间自动启动，更适合用 `systemd` / `launchd` / Windows 任务计划程序把这些脚本再包一层。当前仓库不自动生成系统服务文件。

## 日志与状态文件

程序输出 JSON 行日志，适合重定向到文件。

默认状态文件是 `.cache/lecture-state.json`，主要保存：

1. 已预约讲座
2. 已满员讲座
3. 最近一次读取到的次数统计

这会让程序在后续运行里直接跳过已知终态讲座。

## 测试

```bash
npm run typecheck
npm test
```

## 发布到 GitHub 前不要提交

1. `.env`
2. `ucas-bot.config.json`
3. `.cache/`
4. `logs/`
5. `.venv-ddddocr/`
