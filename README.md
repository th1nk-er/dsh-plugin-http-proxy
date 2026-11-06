# dsh-plugin-http-proxy

DeepSeek Harness HTTP 请求代理插件，支持一键读取系统代理与命令行环境自动注入。

## 特性

- 🌐 **一键同步系统代理**：自动读取 Windows 注册表 / macOS 系统代理配置，免手动配置。
- ⚡ **命令环境自动注入**：自动注入 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY`（大小写兼备），子进程脚本与命令行工具天然继承代理。
- 🖥️ **可视化配置面板**：在 DeepSeek Harness 设置中心中提供独立的「网络代理」页面，支持实时状态监控与热保存生效。
- 🛡️ **回环安全保护**：强制旁路 `localhost`、`127.0.0.1`、`::1` 等本地地址，防止 Web GUI 与 RPC 循环请求断连。

## 安装与配置

作为本地 bundle 安装至当前 profile：

```bash
dsh plugin add ./dsh-plugin-http-proxy
```

在 Harness Web 界面的 **设置 -> 网络代理** 中即可直接查看并修改配置。
