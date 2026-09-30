# Popcorn extension

## 配置架构

- `data/auto_feed.storage.json` 是插件包内唯一的出厂配置文件。
- 仅在真正首次安装（`reason === install`）且 `chrome.storage.local` 完全为空时导入一次。
- 首次安装后，所有用户配置只以 `chrome.storage.local` 中已保存的值为准。
- 浏览器启动、扩展 Reload、扩展升级、页面初始化、脚本注入都不会重新导入、补齐、规范化或恢复出厂配置。
- 配置项为空、删除或全部取消勾选时，程序按当前值执行，不使用代码内置 fallback。
- API、站点目录、快捷搜索目录、各勾选项、Transmission、保活、YADG 音乐助手设置均纳入统一配置。
- 运行缓存/任务状态（例如临时抓取结果、页面缓存、最近保活状态）不是用户配置，可按功能需要动态更新。

## Transmission RPC

`__popcorn_tm_rpc_lan` 与 `__popcorn_tm_rpc_wan` 的出厂值为空。设置页只显示示例提示，不会把示例地址写入配置。
