# 公开配置模型事实

## 配置文件布局

当前项目面向公开仓库的配置模型采用双层结构：

1. `.env`
2. `ucas-bot.config.json`

配套模板文件分别是：

1. `.env.example`
2. `ucas-bot.config.example.json`

## `.env` 的职责

`.env` 当前只承担敏感配置：

1. `UCAS_USERNAME`
2. `UCAS_PASSWORD`
3. 可选的 `UCAS_CONFIG_PATH`

这意味着账号、密码和可能的自定义配置文件路径不会和公开仓库中的个人运行偏好混在一起。

## `ucas-bot.config.json` 的职责

公开配置文件当前承载以下非敏感参数：

1. `logging`
2. `targets`
3. `runtime`
4. `captcha`
5. `filter`

其中最关键的两块是：

1. `runtime.mode`
   - `single`
   - `scheduled`
2. `filter.timeWindows`
   - 当前唯一正式支持的个人筛选配置

## 当前公开模板的默认值

模板当前给出的默认行为是：

1. 运行模式为 `single`
2. `headless=true`
3. `dryRun=true`
4. 状态文件路径为 `.cache/lecture-state.json`
5. 定时巡检窗口为 `08:00-18:00`
6. 巡检间隔为 `60` 分钟
7. 默认时间筛选规则为：
   - 周一 `17:00` 后
   - 周二 `19:00` 后
   - 周三全天

这些默认值既能保持与此前实现兼容，也足够让首次使用者在不改源码的前提下理解整个系统。

## 命令行与配置文件的关系

当前命令行参数不再承担主要配置职责。

稳定事实如下：

1. 命令行主要用于临时调试覆盖。
2. 如果命令行与配置文件发生冲突，命令行临时覆盖优先。
3. 如果没有显式提供 `--config` 或 `UCAS_CONFIG_PATH`，系统默认尝试读取仓库根目录下的 `ucas-bot.config.json`。
4. 如果默认配置文件不存在，系统仍可使用内置默认值启动，但用户无法通过模板外部化自己的运行偏好。

## 仓库忽略规则事实

为了配合这个双层配置模型，`.gitignore` 当前已经明确忽略：

1. `.env`
2. `ucas-bot.config.json`
3. `ucas-bot.config.local.json`
4. 本地缓存、日志、浏览器产物和 Python 虚拟环境

因此公开仓库中保留模板文件，而个人实例文件默认不会进入版本控制。
