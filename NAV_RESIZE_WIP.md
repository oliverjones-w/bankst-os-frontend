# Nav Rail Resize — WIP Notes

Branch: `feat/nav-panel`

## What's done

### Visual side — working ✓
- 8px invisible drag handle placed as a direct child of `.app-shell` (not inside `.left-rail`)
  - Moving it outside the rail was necessary — `overflow: auto` on `.left-rail` was swallowing pointer events
- Handle tracks `--left-rail-w` automatically via CSS: `left: calc(var(--left-rail-w) - 2px)`
- Hidden (`pointer-events: none; opacity: 0`) when rail is closed
- Hover shows a 1px accent-colored line via `::after` pseudo — no fill, no blue bar
- Cursor: `ew-resize` (clean double-arrow, not the large `col-resize` variant)
- `is-resizing-rail` class on `.app-shell` suppresses the grid transition during drag
- `user-select: none` on all children during drag to prevent text selection
- Width clamped 160px–480px
- Persisted to `localStorage` key `shell.leftRailWidth`, restored on boot

### JS (`js/shell.js`)
- `setRailWidth(px)` — clamps, sets `--left-rail-w` + `--left-rail-base-w` on `:root`, persists
- `initRailWidth()` — restores saved width on boot before open/closed state is applied
- `initRailResizeDrag()` — wires `mousedown` on handle, `mousemove`/`mouseup` on `window`
- Called from `initShellState()` which boots in `app.js`

## What's NOT working yet

### Drag has no effect
The visual handle looks correct and the hover state works, but dragging does not
actually resize the panel. Multiple approaches tried:

1. `pointerdown` + `handle.setPointerCapture` + `pointermove` on handle → no effect
2. `pointerdown` + `pointermove`/`pointerup` on `window` → no effect
3. `mousedown` + `mousemove`/`mouseup` on `window` → no effect (current state)

The `getBoundingClientRect().width` fix was applied (original code used
`getComputedStyle` on `--left-rail-w` which returned `var(--left-rail-base-w)`
as a string, causing `parseInt` → `NaN`).

## Suspected root causes to investigate

1. **`mousedown` not firing** — something may be sitting on top of the handle and
   intercepting clicks before they reach it. Worth opening DevTools → Elements,
   inspecting the handle, and checking computed z-index / what's actually at that
   pixel coordinate.

2. **CSS var not propagating** — `setRailWidth` sets `--left-rail-w` on `:root` inline.
   The grid on `.app-shell` reads `var(--left-rail-w)`. Confirm this is actually
   updating by opening DevTools Console and running:
   ```js
   document.documentElement.style.setProperty("--left-rail-w", "400px")
   ```
   If the rail expands, the CSS side works and the JS event wiring is the problem.
   If nothing happens, the CSS inheritance is broken.

3. **`initRailResizeDrag` not running** — check DevTools Console for any JS errors
   on page load that might be aborting the boot sequence before `initShellState()`
   completes.

## Files changed on this branch

| File | Change |
|------|--------|
| `base.css` | Added `--left-rail-min-w: 160px`, `--left-rail-max-w: 480px`; `.is-resizing-rail` rules |
| `css/navigation.css` | `.rail-resize-handle` styles — absolute position, `::after` indicator |
| `index.html` | Handle `<div>` moved outside `<aside>`, placed as sibling after it; v→44 |
| `js/shell.js` | `setRailWidth`, `initRailWidth`, `initRailResizeDrag` functions |

## Quick debug steps for next session

```js
// In browser console — does CSS var update work?
document.documentElement.style.setProperty("--left-rail-w", "400px")

// Does the handle element exist?
document.getElementById("railResizeHandle")

// Is mousedown firing?
document.getElementById("railResizeHandle").addEventListener("mousedown", () => console.log("hit"))
```
