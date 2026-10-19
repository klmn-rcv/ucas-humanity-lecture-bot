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

如果 `npx playwright install chromium` 因 `self-signed certificate in certificate chain` 失败，需要切换到不拦截 HTTPS 的网络环境，或先把本地/校园网证书链加入 Node 信任配置。

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

默认讲座页面为 `https://jwxk.ucas.ac.cn/subject/humanityLecture`。程序支持旧版 SEP 应用页和新版卡片式个人工作台：登录后会进入“课程学习”中的“人文讲座”卡片，沿“更多讲座”入口完成单点登录。

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
.\scripts\run-bot.cmd
```

仅检查候选讲座：

```powershell
.\scripts\run-bot.cmd --dry-run
```

真实报名：

```powershell
.\scripts\run-bot.cmd --no-dry-run
```

显示浏览器：

```powershell
.\scripts\run-bot.cmd --headful
```

`.cmd` 启动器可直接在 PowerShell 或命令提示符中运行，不受 PowerShell 脚本执行策略限制。若 `.cache/node` 下有便携 Node，启动器会自动使用它，否则使用系统 Node。

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
.\scripts\run-bot.cmd --headful --dry-run
```

如果出现验证码，程序会自动识别。  
如果出现新设备邮箱验证，需要在浏览器中手工完成验证；完成后重新运行同一命令即可。

## 挂机等待预约开放

将 `ucas-bot.config.toml` 配置为以下内容，然后启动程序。`dryRun = false` 会执行真实预约：

```toml
[runtime]
mode = "scheduled"
headless = true
dryRun = false

[runtime.schedule]
periods = [["00:00", "23:59"]]
intervalMinutes = 720
runImmediatelyOnStart = true
```

程序启动后登录并扫描全部列表页，立即尝试已经开放的讲座。所有未开放讲座按各自预约开放时间等待；提前 1 分钟刷新并检查登录状态，到点刷新，如果按钮还没出现则每秒重查相关页面。多场同时开放会逐场提交，成功、已报名、满额或截止后不再尝试该场。时间以北京时间解释。

程序保持同一个浏览器会话，每次全量扫描结束 12 小时后再次扫描全部页面以发现新讲座和时间变更；已知预约开放前 1 分钟会提前检查，开放后每秒检查入口。队列只放内存中，重启会从网站重建。新设备邮箱验证需要人工完成；电脑须保持运行和联网，睡眠或关机期间无法预约。

`intervalMinutes` 从每次全量扫描结束后开始计时。`periods` 只在 `runImmediatelyOnStart = false` 时决定首次扫描的等待时段；之后按 `intervalMinutes` 间隔扫描。已经发现的预约开放时间会独立触发，不受 `periods` 限制。默认不限制讲座标题、主题和开讲时间。旧配置里的 `filter.timeWindows` 是开讲时间过滤，要全抢时请删除这些过滤项或设成全周全天。

网站返回“报名成功”才会记录成功。时间冲突等明确拒绝会留日志，下一次普通重扫再检查；满额不再重复尝试。页面显示听讲次数已达到要求时，程序停止。日志中的有效听讲次数不会因为一次预约成功就立即增加。

先用 `--dry-run` 可预览当前候选和未来开放时间；按 `Ctrl+C` 停止前台运行。

## 后台运行

### macOS / Linux

```bash
./scripts/run-bot-background.sh
tail -f logs/bot.log
```

### Windows PowerShell

```powershell
.\scripts\run-bot-background.cmd
Get-Content .\logs\bot.log -Wait
```

关闭查看日志的窗口不会停止后台程序。停止后台预约：

```powershell
Stop-Process -Id (Get-Content .\logs\bot.pid)
```

后台模式无法自动处理邮箱验证。校外网络建议先完成一次前台验证。

## 测试

```bash
npm run typecheck
npm test
```

测试包含本地模拟网站的预约流程，需要已安装 Playwright Chromium。Windows 本机便携 Node 不在系统 PATH 时，可在 PowerShell 中先执行 `$env:PATH = "$PWD\.cache\node\node-v24.20.0-win-x64;$env:PATH"` 再运行上面的命令。
