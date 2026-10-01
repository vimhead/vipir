# Vipir — Vim-first Pi

Modal editing, keyboard navigation, web tools, background jobs, themes, and Norn workflows for the [Pi coding agent](https://pi.dev).

## Install

```sh
pi install git:github.com/vimhead/vipir
```

Start Pi, open **`/vipir`**, and press **S** to install the collection. Every package is enabled by default; disable any you do not want before syncing.

## Use

- Move with the displayed selection keys; **Enter** or **Space** toggles a package.
- **S** saves and syncs. **U** syncs and updates. **r** refreshes status.
- **Esc** closes; unsaved changes can be applied or discarded.
- Toggle the editor and its three plugins separately. Disabling the editor disables its plugins; enabling a plugin enables the editor.
- Package changes reload Pi. Preferences are saved in `~/.pi/agent/vipir.json`.

Includes [vipir-editor](https://github.com/vimhead/vipir-editor) for coordinated Vim editing, plus separate [jump mode](https://github.com/vimhead/vipir-jump-mode), [command palette](https://github.com/vimhead/vipir-command-palette), and [input-source](https://github.com/vimhead/vipir-input-source) plugins, [background jobs](https://github.com/vimhead/vipir-background-jobs), [web access](https://github.com/vimhead/vipir-web-access), [themes](https://github.com/vimhead/vipir-themes), and [pi-norn](https://www.npmjs.com/package/@vimhead.dev/pi-norn).

Use current Pi and Node.js 24+. Input-source switching needs macOS and `macism`; Norn needs its CLI installed separately.

To remove the manager: `pi remove git:github.com/vimhead/vipir`. Installed packages remain until you disable or remove them.
