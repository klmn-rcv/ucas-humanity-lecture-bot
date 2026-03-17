# UCAS 人文讲座自动报名工具

使用 `Playwright + TypeScript + ddddocr` 自动登录国科大 SEP / 选课系统，抓取人文讲座列表，按配置的时间规则筛选讲座并自动报名。

## 环境要求

1. Node.js `>= 22`
2. `npm`
3. Python `>= 3.10`
4. Playwright Chromium

安装 Node 依赖和浏览器：

```bash
npm install
npx playwright install chromium
```

## 安装 ddddocr

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

## 准备配置

创建 `.env`：

```bash
cp .env.example .env
```

填写账号密码：

```env
UCAS_USERNAME=your_ucas_username
UCAS_PASSWORD=your_ucas_password
```

创建主配置文件：

```bash
cp ucas-bot.config.example.toml ucas-bot.config.toml
```

`ucas-bot.config.example.toml` 自带注释，配置项说明以该文件中的注释为准。

## 运行

### macOS / Linux

单次运行：

```bash
./scripts/run-bot.sh
```

仅检查候选讲座：

```bash
./scripts/run-bot.sh --dry-run
```

真实报名：

```bash
./scripts/run-bot.sh --no-dry-run
```

显示浏览器：

```bash
./scripts/run-bot.sh --headful
```

### Windows PowerShell

单次运行：

```powershell
.\scripts\run-bot.ps1
```

仅检查候选讲座：

```powershell
.\scripts\run-bot.ps1 --dry-run
```

真实报名：

```powershell
.\scripts\run-bot.ps1 --no-dry-run
```

显示浏览器：

```powershell
.\scripts\run-bot.ps1 --headful
```

## 校园网内运行

推荐先执行一次：

```bash
./scripts/run-bot.sh --dry-run
```

确认页面和筛选结果正常后，再切换到真实报名或 `scheduled` 模式。

## 校园网外运行

首次运行推荐使用可见浏览器：

```bash
./scripts/run-bot.sh --headful --dry-run
```

Windows：

```powershell
.\scripts\run-bot.ps1 --headful --dry-run
```

如果出现验证码，程序会自动识别。  
如果出现新设备邮箱验证，需要在浏览器中手工完成验证；完成后重新运行同一命令即可。

## 定时巡检

将 `ucas-bot.config.toml` 中的 `runtime.mode` 改成 `scheduled`，并按需修改：

1. `runtime.schedule.periods`
2. `runtime.schedule.intervalMinutes`
3. `filter.timeWindows`

当前时间段配置使用数组表示一个时间段，支持同一天多个不连续时段。例如：

```toml
[runtime]
mode = "scheduled"

[runtime.schedule]
periods = [["08:00", "12:00"], ["14:00", "18:00"]]
intervalMinutes = 60
runImmediatelyOnStart = true

[[filter.timeWindows]]
weekday = 2
periods = [["09:00", "11:00"], ["19:00", "21:30"]]
```

## 后台运行

### macOS / Linux

```bash
./scripts/run-bot-background.sh
tail -f logs/bot.log
```

### Windows PowerShell

```powershell
.\scripts\run-bot-background.ps1
Get-Content .\logs\bot.log -Wait
```

后台模式无法自动处理邮箱验证。校外网络建议先完成一次前台验证。

## 测试

```bash
npm run typecheck
npm test
```
