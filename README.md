# Popcorn extension v24.6.0

This is a development build that runs Popcorn without Tampermonkey.

## Changes in v0.6.0

- Removed strict mode from the userscript wrapper and predeclared `host_link`, matching Tampermonkey behavior more closely.
- Fixed import of Tampermonkey storage backups: values like `s...` and `n...` are decoded before storing into `chrome.storage.local`.
- Derives `host_link` from `setting_host` + `setting_host_list` when possible.
- Opens the options page on install/update/reload so first-run configuration is visible.
- Added a basic settings UI for `host_link`.

