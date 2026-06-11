Development
-----------

    npm run build      # Build all packages (tsdown)
    npm test           # Run all tests (vitest)
    npm run coverage   # Test coverage report (vitest + v8)
    npm run typecheck  # tsc --noEmit across workspaces
    npm run lint       # eslint
    npm run format     # prettier --write
    npm run lint:deps  # dependency-cruiser
    npm run check      # Combined gate

TUI tweaks
----------

Column headers paint a 2-column icon next to each field name so the
column type is recognisable at a glance. The TUI ships with two icon
sets and uses the emoji one by default:

- **emoji** (📝 🔢 🏷 ✅ 📅) — default. Works on every modern terminal:
  iTerm2, WezTerm, Ghostty, Apple Terminal, VS Code, Windows Terminal,
  Kitty, Alacritty, and so on — including when those are hosting a WSL
  shell underneath.
- **ascii** (T № ◉ ☑ ▦) — automatic fallback only inside environments
  known to misrender emoji: tmux, Linux virtual consoles, or a WSL
  shell with no recognised outer terminal (typically bare conhost).

Force a set with `LATTIX_ICONS=emoji` or `LATTIX_ICONS=ascii`.

License
-------

MIT
