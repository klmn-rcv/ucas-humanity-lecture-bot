# 公开配置模型事实

## 当前配置分层

当前项目的公开配置模型是两层结构，但两层职责不重复：

1. `.env`
2. `ucas-bot.config.toml`

配套模板文件分别是：

1. `.env.example`
2. `ucas-bot.config.example.toml`

## `.env` 的职责

`.env` 当前只承担敏感配置：

1. `UCAS_USERNAME`
2. `UCAS_PASSWORD`

稳定事实是：当前程序不再依赖环境变量保存非敏感运行行为配置。

## `ucas-bot.config.toml` 的职责

公开配置文件当前承载以下非敏感参数：

1. `logging`
2. `targets`
3. `runtime`
4. `captcha`
5. `filter`

这意味着用户平时要修改运行行为时，主要修改的是 `ucas-bot.config.toml`。

## 调度配置事实

当前巡检配置位于 `runtime.schedule`，包含：

1. `periods`
2. `intervalMinutes`
3. `runImmediatelyOnStart`

其中 `periods` 的稳定格式是数组套数组，例如：

```toml
periods = [
  ["08:00", "12:00"],
  ["14:00", "18:00"]
]
```

每个内层数组表示一个可运行时间段，因此同一天内允许多个不连续时段。

## 筛选配置事实

当前唯一正式支持的个人筛选配置是 `filter.timeWindows`。

它的稳定结构是：

1. `weekday`
2. `periods`

其中 `periods` 同样使用数组时间段模型。例如：

```toml
[[filter.timeWindows]]
weekday = 2
periods = [["09:00", "11:00"], ["19:00", "21:00"]]
```

这说明筛选模型已经支持“同一天多个不连续时段”。

## 验证码配置事实

当前验证码配置位于 `captcha`，稳定字段只有：

1. `enabled`
2. `maxAttempts`
3. `pythonExecutable`

不再存在 `language`、`langPath` 等 `tesseract.js` 相关字段。

## 命令行与配置文件的关系

当前命令行参数不再承担主要配置职责。稳定事实如下：

1. 默认配置文件路径是仓库根目录下的 `ucas-bot.config.toml`。
2. 如果本地仍然保留旧的 `ucas-bot.config.json`，当前实现会兼容读取。
3. 命令行主要用于临时覆盖，例如 `--headful` 或 `--dry-run`。
4. 即使存在命令行覆盖，公开 README 仍然以配置文件作为主要配置方式。

## 仓库忽略规则事实

为了配合这个配置模型，`.gitignore` 当前明确忽略：

1. `.env`
2. `ucas-bot.config.toml`
3. `ucas-bot.config.json`
4. `ucas-bot.config.local.json`
4. `.cache/`
5. `logs/`
6. `.venv-ddddocr/`
