# SillyStatus

A SillyTavern extension that tracks ongoing status effects (hypnosis, training, transformations, curses, injuries and so on) in a small floating panel with stages and progress bars. Built with mobile in mind.

## Install

In SillyTavern: **Extensions** (cubes icon) → **Install extension** → paste:

```
https://github.com/OrdeliaLys/SillyStatus
```

Then reload the page.

## How it works

- A button in the top-left corner shows how many effects are active. Tap it to open the list, tap an effect for details, stage controls, editing and removal. Use **+** to add one by hand.
- After each character reply, the extension makes one short extra AI request to check what started, changed or ended, and updates the bars.
- The active effects and their stages are sent to the AI with every prompt.
- Effects are saved on each message, so swiping or deleting a reply undoes its changes.
- Settings live under **Extensions → Status Effects**.
