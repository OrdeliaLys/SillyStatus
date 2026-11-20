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

## Screen effects

Effects can also tint the screen behind the chat. There are 23 visuals, such as a hypnotic spiral, pink haze, floating hearts, red pulse, frost, flames, holy light, glitch scanlines and drained colour. Each grows stronger as the effect's stage rises. The AI picks one when it adds an effect, and you can change it in the effect's edit form. Full-screen washes (spiral, haze, hearts, fog, flames and so on) are drawn under the messages, and edge effects (vignettes, scanlines, static) on top of them. You can force all of them under or over instead. While an effect is drawn under the messages, the extension draws the chat's background tint itself, beneath the effect, so the chat looks the same as usual apart from the effect. Strength, animation, placement and a preview of every visual are under **Extensions → Status Effects**.

### Flashing words and the converging ring

Put a list in square brackets, separated by semicolons, in an effect's description, like `[sleep; obey; deeper]`, and those words will flash behind the chat while the effect is active. The AI adds such lists itself for mantras, commands, trigger words and intrusive thoughts.

The **Converging ring** visual closes in from the edges and pulses at the centre. While it's active, the flashing words pop in the centre on each pulse instead of appearing at random.

### Status icons

Every effect has an icon. The AI picks one when it adds an effect, and you can choose another from the picker in the effect's edit form. Icons appear in the panel and as small badges on the latest portrait of the affected character, with a ring that fills up as the effect progresses. Tap a badge to open that effect. Turn badges off under **Extensions → Status Effects**.

### Out-of-character requests

Ask out of character, like `((set the hypnosis to stage 6))` or `((remove the bruise))`, and the next check applies it directly, ignoring the usual one-step limit.

### Changes under each message

Each message shows what it changed: new effects, stage changes (⚡ for big jumps), edits and ended effects, as small chips under the text. Tap a chip to open that effect. The newest reply also gets a ↻ button to check it again. Pop-ups for changes are off by default and can be turned back on in settings.

### Swipes

Changes are saved per swipe. A new swipe starts from the state before that message, and swiping back to an earlier swipe brings back that swipe's own changes.
