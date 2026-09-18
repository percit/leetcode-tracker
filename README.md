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
- **Everything is local**: progress lives in the browser's `localStorage`,
  nothing is sent anywhere.

No build step — open `index.html`, or serve the folder statically / via
GitHub Pages.
