# Popcorn extension v24.6.0

This is a development build that runs Popcorn without Tampermonkey.

## Changes in v0.6.0

- Removed strict mode from the userscript wrapper and predeclared `host_link`, matching Tampermonkey behavior more closely.
- Fixed import of Tampermonkey storage backups: values like `s...` and `n...` are decoded before storing into `chrome.storage.local`.
- Derives `host_link` from `setting_host` + `setting_host_list` when possible.
- Opens the options page on install/update/reload so first-run configuration is visible.
- Added a basic settings UI for `host_link`.

## Install

1. Remove old Popcorn extension.
2. Load this folder as an unpacked extension.
3. Confirm the host link in the options page.
4. Refresh the target PT page with Ctrl+F5.


## v26
- BHD 快捷搜索改为精简 IMDb 搜索链接：`/torrents?search={imdbid}&doSearch=Search&sorting=bumped_at&direction=desc&qty=25`。
- 自动迁移旧的 BHD `?imdb={imdbid}` 链接。


## v34
- 基于 v29。新增“剧集搜索 IMDb 归一化站点”设置，只对勾选的快速搜索站点在豆瓣剧集页执行季/单集 IMDb -> 剧集主 IMDb 转换。默认 BHD / BTN。
- 不再做全局所有站点拦截，电影页不受影响。
