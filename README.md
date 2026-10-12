# gridgrind

A personal LeetCode pattern tracker. Not a code editor or judge — you solve on
leetcode.com as usual, this just tracks *what* to do next and *when to come
back to it*.

Problem list seeded from [Automedon/ultimate-leetcode-patterns](https://github.com/Automedon/ultimate-leetcode-patterns)
(41 patterns, 20 problems each, ranked by interview frequency). Hard problems
are filtered out for now — Easy/Medium only.

## How it works

- **Adaptive progression per pattern**: solve a few Easy problems in a
  pattern (default: 3) and Medium unlocks — you don't have to clear every
  Easy first. Solve a couple of Medium cleanly (default: 2) and the app moves
  you to the next pattern, skipping whatever's left in this one.
- **Timer as a budget, not a stopwatch**: 30 min for Easy, 45 for Medium.
  Keeps counting past zero (shows `+MM:SS`) so the logged time is always
  accurate even if you go over.
- **Spaced repetition (Leitner-style)**: every attempt is logged with an
  outcome (solved cleanly / solved but struggled / not solved) plus a note on
  what went wrong. A bad or slow outcome resets the review interval to
  tomorrow; a clean solve pushes it further out (1 → 2 → 4 → 8 → 16 → 30
  days). Anything due shows up at the top of "Dziś" before any new
  suggestion, so weak spots get cleared before moving on to new patterns.
- **Everything is local**: progress lives in the browser's `localStorage`.
  Nothing is sent anywhere except to the optional local server below.

## Running it

**Quick, no persistence to git**: just open `index.html` directly. Progress
is saved to `localStorage` only — fine for a look around, but nothing lands
in this repo, and it won't follow you to another browser or machine.

**With auto-saved, git-trackable progress (recommended)**: double-click
`Start gridgrind.command` (or run `python3 server.py`), which opens the app
at `http://127.0.0.1:8765/`. From then on, every attempt/note/solution you
save is also written straight to `data/progress.json` in this repo — no
export step, nothing to remember. Commit that file whenever you want a
checkpoint:

```
git add data/progress.json && git commit -m "progress update"
```

Requires only Python 3 (already on macOS). Works in any browser, including
Firefox — it's a plain local HTTP server, not a browser-specific API.

## Online (GitHub Pages) — e.g. from work, nothing to install

The same app runs at **https://percit.github.io/leetcode-tracker/**. There it
reads `data/progress.json` straight from this repo and, once you add a token,
writes every save back to the repo (a commit per save, debounced ~1.5 s).

1. Create a fine-grained token: GitHub → Settings → Developer settings →
   Fine-grained tokens → *Only select repositories: leetcode-tracker* →
   Repository permissions → *Contents: Read and write*.
2. On the page: Patterny → 🔑 token GitHub → paste. It's stored only in that
   browser's localStorage.

Without a token the page still works read-only from the repo + saves to
localStorage. After practising on the web, `git pull` at home before using the
local server so you don't overwrite the newer progress.
