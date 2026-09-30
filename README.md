# Vipi — vi-like Pi

Modal editing, keyboard navigation, web tools, background jobs, themes, and Norn workflows for the [Pi coding agent](https://pi.dev).

## Install

```sh
pi install git:github.com/vimhead/vipi
```

Start Pi, open **`/vipi`**, and press **S** to install the collection. Every package is enabled by default; disable any you do not want before syncing.

## Use

- Move with the displayed selection keys; **Enter** or **Space** toggles a package.
- **S** saves and syncs. **U** syncs and updates. **r** refreshes status.
- **Esc** closes; unsaved changes can be applied or discarded.
- Toggle the editor and its three plugins separately. Disabling the editor disables its plugins; enabling a plugin enables the editor.
- Package changes reload Pi. Preferences are saved in `~/.pi/agent/vipi.json`.

Includes [vipi-editor](https://github.com/vimhead/vipi-editor) for coordinated Vim editing, plus separate [jump mode](https://github.com/vimhead/pi-me-jump-mode), [command palette](https://github.com/vimhead/pi-me-command-palette), and [input-source](https://github.com/vimhead/pi-me-input-source) plugins, [background jobs](https://github.com/vimhead/pi-background-jobs), [web access](https://github.com/vimhead/pi-web-access), [themes](https://github.com/vimhead/pi-vipi-themes), and [pi-norn](https://www.npmjs.com/package/@vimhead.dev/pi-norn).

Use current Pi and Node.js 24+. Input-source switching needs macOS and `macism`; Norn needs its CLI installed separately.

To remove the manager: `pi remove git:github.com/vimhead/vipi`. Installed packages remain until you disable or remove them.
