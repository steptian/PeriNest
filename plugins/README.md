# PeriNest 插件契约（v1）

> 内核薄、业务模块按契约生长（dsh ctx-seam 模式）。
> 内核四挂载点：路由 / 权限域 / 工具 / 迁移——内核不知道任何插件内部。

## 插件目录

```
plugins/
├── cercus/                 # 示范插件：企微私域
│   ├── __init__.py         # plugin: PluginMeta 挂载声明（唯一入口）
│   ├── endpoints.py        # APIRouter（seam 1）
│   ├── models.py           # 表 pn_<插件>_*（seam 4: versions/ 子目录）
│   ├── service.py / crypto.py / tasks.py
│   ├── tools.py            # MCP 工具声明+执行（seam 3）
│   ├── versions/           # 未来迁移（alembic version_locations 动态挂载）
│   └── test_cercus.py      # 测试（experimental 不降质量标准，照跑 CI）
└── experimental/           # 实验区（默认不装、发布排除）
```

## 契约（PluginMeta 字段）

| seam | 字段 | 内核行为 |
|:--|:--|:--|
| 路由 | `routers` | 启动时 include（加载失败自动跳过不炸内核） |
| 权限域 | `perm_domains` | 动态并入鉴权（admin 恒全量；parity 自动对账） |
| 工具 | `mcp_tools` + `mcp_executors` | MCP tools/list 合并 + tools/call 分发（权限门统一在分发层） |
| 迁移 | `versions/` 目录 | alembic version_locations 动态挂载 |
| 异步 | `celery_includes` + `beat_schedule` | worker import + beat 动态注册 |
| 配置 | （v1 显式映射，见 runtime_config.plugin_config_keys） | 运行时配置键（settings 字段留在内核并注明归属——妥协点，独立分发时重构） |

## 新插件流程

1. `plugins/<name>/` 建包，`__init__.py` 导出 `plugin = PluginMeta(...)`
2. `PERINEST_Q_PLUGINS` env 加名字（重启生效）
3. 端点/工具登记 parity（`tests/test_capability_parity.py`——插件禁用时自动跳过）
4. 测试放插件目录（CI 经 `testpaths` 同跑）

## experimental 政策（dsh 机械隔离）

- **默认不装**：不进 `PLUGINS` 默认值；想用显式加 env
- **发布排除**：官方 tag/README 不宣传 experimental 能力
- **稳定区禁止依赖**：内核与稳定插件不得 import experimental
- **不降质量标准**：测试照跑、parity 照对账——隔离的是稳定性承诺，不是质量要求

## v2 议题（当前不做，勿增实体）

- 独立 pip 包分发（现在：monorepo 源码 + sys.path 注入）
- 前端构建裁剪（现在：全量构建 + 按权限显隐，Cercus 模式）
- 插件启用/禁用的运行时热切换（现在：重启生效）
