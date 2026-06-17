# Abendprogramm

A Chrome side-panel extension for a group's nightly web-game ritual: open the
games, tick them off, track time, and keep the streak. Built with plain
JavaScript and Manifest V3 — no build step, no dependencies.

> **AI disclaimer** — this project is AI slop. Every line of code,
> the UI, the theme, and this README were generated entirely by
> [Claude Opus 4.8](https://www.anthropic.com/claude) (Anthropic) through
> iterative prompting. No human wrote any source code directly.


## Features

- **Side panel** that stays docked beside your tabs while you play.
- **One-click advance** — "Done → next" finishes the current game and opens the next.
- **Favicons** for each game, from Chrome's local cache (no network calls).
- **Timer** tracking time per game and overall, with the active game ticking live.
- **Calendar** of nights played: games finished and time spent per day.
- **Groups** (Words, Trivia, Geo, …) you can switch on/off for the night.
- **Streak** counter and a single toolbar badge showing games left tonight.
- **English / German** with an in-app switch (no reload needed).
- **Import / export** the game list as JSON to share with friends.

## Install (load unpacked)

1. Download this repo (green **Code** button → **Download ZIP**, then unzip) or `git clone` it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder (the one with `manifest.json`).
5. Pin the diamond icon from the toolbar's puzzle-piece menu.

## Project structure — where to tinker

| File | What it does |
| --- | --- |
| `manifest.json` | Extension config: name, permissions, entry points. |
| `lib.js` | The core — data model, storage, **translations**, timer & history logic, default games. Most edits start here. |
| `sidepanel.html` / `sidepanel.js` | The main panel UI and ritual flow. |
| `options.html` / `options.js` | The manager: add/remove games, groups, language. |
| `history.html` / `history.js` | The calendar / history page. |
| `styles.css` | Shared theme (the "late-night arcade" palette) for every page. |
| `background.js` | Service worker: opens the panel, midnight reset, toolbar badge. |
| `icons/` | Toolbar icons. |

To add a game by default for everyone, edit `DEFAULT_GAMES` at the top of `lib.js`.
To add or change wording, edit the `I18N` object in `lib.js`.

## Development loop

Edit a file, then go to `chrome://extensions` and click the **reload** icon on
the Abendprogramm card. Changes to the side panel/options also need the panel
reopened. There's nothing to compile.

## License

MIT — see [LICENSE](LICENSE). Tinker freely.
