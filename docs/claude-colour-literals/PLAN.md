# Colour literals — implementation plan

Status: **not started**. Written up during planning (high effort), ready to execute
(intended to be run at low effort, picking up straight from this file).

## Goal

Add a third kind of literal alongside the existing image/sound media literals:
a colour literal. Unlike image/sound, it has no function-call underlying code —
its underlying Python code is just a plain quoted string matching `#aabbcc`
(6 hex digits). It should:

- show a preview dialog (on hover) with a filled rectangle of the colour, plus
  an Edit button that opens the existing colour-picker dialog (`ColourPickerDlg.vue`,
  already wired up to Ctrl+Shift+Y)
- auto-convert from a plain string to a colour literal when the user types a
  matching pattern into a string **and the cursor leaves that string** (not
  while still typing/partway through)
- auto-convert when loading existing `.py` programs that contain a matching
  plain string literal
- generate Python identical to the underlying code (the bare quoted string),
  exactly like image/sound literals already do
- behave like existing media literals otherwise: single-character-wide in the
  editor, same navigation/deletion/copy-paste behaviour

## Core design decision

A colour literal is a `MediaSlot` (`src/types/types.ts`) with `mediaType: "colour"`
and `code` equal to the bare quoted string itself (e.g. `"#aabbcc"`), **not** a
function call. All the generic `SlotType.media` machinery (1-char-wide navigation,
flattening via `generateFlatSlotBases`, undo/redo, Python codegen in `parser.ts`/
`editor.ts`, copy/paste round-trip via `data-code`/`data-mediaType` attributes) is
already `mediaType`-agnostic and needs **no changes**. The work is entirely about:
(a) detecting/converting a plain string into this shape at the right moments, and
(b) colour-specific preview/edit UI.

Existing prior art already on this branch:
- `MediaSlot`/`isFieldMediaSlot` (`src/types/types.ts:59-95`) — image/sound literals.
- The colour picker dialog itself: `ColourPickerDlg.vue`, `helpers/colour.ts`
  (`parseColourToHex`, `hexToHsv`/`hsvToHex`/etc., `COLOUR_FAMILIES`), already
  wired to Ctrl+Shift+Y via `triggerColourPicker()` in `LabelSlot.vue` (~line 1076),
  which today inserts/replaces a **plain string literal** (`SlotType.string`) with
  the picked hex — this plan changes that to insert/convert to the new colour
  `MediaSlot` instead (see §3).

---

## 1. Detection helper — `src/helpers/colour.ts`

Add:
```ts
export function isHexColourLiteral(s: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(s);
}
```
Keep this separate from the existing, more lenient `parseColourToHex` (accepts CSS
names, `rgb()`, etc. — used only to *seed* the picker from arbitrary content).
`isHexColourLiteral` is the strict predicate used for auto-detection (typing-blur
and python-load). Wherever a match becomes stored `code`, normalise the hex digits
to lowercase (matches `parseColourToHex`'s own canvas-based normalisation).

## 2. Data model — `src/types/types.ts`

No new interface needed. Reuse `MediaSlot`/`isFieldMediaSlot` unchanged. Add a
one-line comment near the existing "For MediaSlot, code contains: load_image(...)"
comment (~line 63) noting `mediaType: "colour"` is the exception where `code` is a
bare quoted string, not a function call.

## 3. Ctrl+Shift+Y insertion — `src/components/LabelSlot.vue` `triggerColourPicker()` (~line 1076)

Two branches, **both now produce a colour `MediaSlot` immediately** (no reliance
on §4's blur mechanism):

- **Not-in-string branch** (~line 1135, `commitInsertion`): replace
  `this.appStore.addNewSlot(targetSlotInfos, "\"", lhsCode, rhsCode, SlotType.string, false, hex)`
  with the media form:
  `addNewSlot(targetSlotInfos, "colour", lhsCode, rhsCode, SlotType.media, false, "\"" + hex + "\"")`.
  This is the existing generic `addNewSlot` `SlotType.media` branch
  (`store.ts:967-990`) — no store changes needed here. Cursor placement into the
  trailing sibling field (`slotIndex + 2` after the splice) already works exactly
  as today (see the existing `commitInsertion` cursor-placement code, mirrored
  from `triggerMediaRecording`).

- **In-string branch** (~line 1102, `commitReplacement`): **per discussion,
  converts and places the cursor in the adjacent field**, rather than leaving the
  cursor "inside" the (now atomic) literal. Concretely:
  - New store action in `src/store/store.ts`, e.g.
    `convertStringSlotToColourLiteral(slotInfos: SlotCoreInfos, hex: string)`:
    - resolve the parent fields array + index via `getSlotParentIdAndIndexSplit`
      (same pattern `addNewSlot` already uses, `store.ts:945-948`)
    - read the *existing* `StringSlot.quote` before overwriting (preserves `'`
      vs `"`)
    - snapshot state (`cloneDeep(this.$state)`), replace
      `parentFieldSlot.fields[index] = {mediaType: "colour", code: quote + hex.toLowerCase() + quote} as MediaSlot`
      **in place at the same index** (no splice needed — a string slot is always
      already flanked by its own lhs/rhs sibling fields from whenever it was
      originally created, since `addNewSlot`'s string branch always wraps
      `[lhs, string, rhs]`, so "adjacent" already exists structurally)
    - `saveStateChanges(stateBeforeChanges)` (single undo step)
  - `commitReplacement` calls this instead of `setFrameEditableSlotContent`, then
    places the cursor at position 0 of the sibling field at `slotIndex + 1`
    (same `setDocumentSelection`/`setSlotTextCursors`/`setFocusEditableSlot`
    triple pattern already used in `commitInsertion` elsewhere in this file).

## 4. Organic typing + blur conversion

The "user typed `#aabbcc` by hand and the cursor left the string" case. Reuses the
existing reparse pipeline rather than a bespoke mutation, so cursor repositioning,
undo/redo, and "structural change" re-rendering (`majorChange`/`refactorCount`)
all come for free.

- `parseCodeLiteral`'s string-handling branch (`src/helpers/editor.ts:1717-1746`)
  is the single place every string literal becomes a `StringSlot` (line 1740:
  `const structOfString: StringSlot = {code: stringContentCode, quote: openingQuoteValue};`).
  Right before building it, compute:
  - `cursorInsideThisString = flags?.cursorPos !== undefined && flags.cursorPos >= openingQuoteIndex && flags.cursorPos <= closingQuoteIndex`
    (inclusive bounds — ambiguous/boundary cases default to "still inside", i.e.
    don't convert).
  - `hasPrefix`: heuristic check that `beforeStringCode`'s tail isn't a bare
    `f`/`r`/`b` (or 2-letter combo, case-insensitive) directly touching the
    opening quote with no separating space/operator. Guards against converting
    `f"#aabbcc"`/`r"#aabbcc"`/`b"#aabbcc"` — these are constructed live exactly
    the same way a plain string is (via `addNewSlot`'s string branch taking
    whatever `lhsCode` preceded the typed quote character).
  - If `!cursorInsideThisString && !hasPrefix && isHexColourLiteral(stringContentCode)`,
    build a `MediaSlot` (`{mediaType: "colour", code: quote + stringContentCode.toLowerCase() + quote}`)
    instead of the `StringSlot`. Everything downstream is already generic:
    `checkSlotRefactoring`'s `$nextTick` cursor-repositioning block already
    special-cases `labelSlotMediaClassName` as 1-char-wide
    (`LabelSlotsStructure.vue:572-577`).

- **Trigger**: mere cursor movement (Tab / click-away / arrow-out) never fires
  `onInput`, so `checkSlotRefactoring` never runs on blur today — this needs a new
  trigger. In `LabelSlot.vue onLoseCaret` (~line 712), when
  `this.slotType === SlotType.string`, emit the existing `requestSlotsRefactoring`
  event (already listened to at `LabelSlotsStructure.vue:36`,
  `@requestSlotsRefactoring="checkSlotRefactoring"`) with a new option:
  `{useFlatMediaDataCode: true, treatAsBlurred: true}`.

- **New plumbing needed** (the one real wrinkle found while planning): add
  `treatAsBlurred?: boolean` to `checkSlotRefactoring`'s options type
  (`LabelSlotsStructure.vue:508`). At line 541, change the `cursorPos` computation
  to:
  `cursorPos: (options?.skipCursorSetAndStateSave || options?.treatAsBlurred) ? undefined : focusCursorAbsPos`
  — deliberately *not* reusing `skipCursorSetAndStateSave` alone, since that flag
  also skips `saveStateChanges`, which must still run (the conversion needs to be
  a real undo step). Also skip the `$nextTick` cursor-repositioning block under
  `treatAsBlurred` (nothing to reposition into — we're leaving the slot). With
  `cursorPos` forced `undefined`, every string in the label reads as "cursor not
  inside" for that one reparse pass, which is exactly correct for a
  blur-triggered pass.

## 5. Rendering & preview UI

- **`LabelSlot.vue loadMediaPreview()`** (~line 2070): add a
  `mediaType === "colour"` branch that draws a filled square on an offscreen
  canvas from the hex (stripped of quotes) and returns
  `{mediaType: "colour", imageDataURL: canvas.toDataURL()}`. Reuses the existing
  `<img v-if="isMediaSlot">` template branch (~line 37) and the
  `.limited-height-inline-image` CSS (`max-height: 1.5em`, ~line 2270) — no
  template/CSS changes needed; the swatch will render at roughly
  one-character-width automatically.
- **`MediaPreviewPopup.vue`**: inject `openColourPickerInDialog` alongside the
  existing `editImageInDialog`/`editSoundInDialog`. In `doEdit()` (~line 192),
  branch on `mediaType === "colour"` to call it instead of the image/sound edit
  dialogs. Per spec ("just shows the colour in a filled rectangle, then an edit
  button"), hide the Preview/Download buttons and the image/sound header link for
  colour (`v-if="mediaType !== 'colour'"` or similar) — show the hex text itself
  as the header instead (may avoid needing a new i18n key).

## 6. Loading existing Python programs — `src/helpers/pythonToFrames.ts`

In `toSlots()`'s terminal-string branch (~line 890-901), where `strMatch` already
separates prefix (`strMatch[1]`), quote (`strMatch[2]`), and content — the single
place plain string tokens are constructed (f-strings are a different, compound
parse-tree node and never reach this branch, so no separate f-string guard is
needed here, unlike in §4). When `strMatch[1] === ""` (no prefix) and
`isHexColourLiteral(content)`, return a `MediaSlot` field instead of the
`StringSlot`, in the same `{fields:[blank, X, blank], operators:[blank, blank]}`
shape already used for both cases. No need to touch
`replaceMediaLiteralsAndInvalidOps` (~line 777) — that function's pattern
(ident-then-bracket, for `load_image(...)`/`load_sound(...)`) doesn't apply to a
bare string token.

## 7. Python codegen / round-trip — verify only, likely no changes

`parser.ts` (~line 829, `getSlotStartsLengthsAndCodeForFrameLabel`) and
`editor.ts slotStructureParserToString` (~line 2385) already emit `field.code`
as-is for any `SlotType.media`/`isFieldMediaSlot` field, generic over
`mediaType` — a colour literal's `code` (`"#aabbcc"`) comes out correctly
unchanged.

Minor polish item (low priority, optional): `parser.ts`'s `omitMediaLiterals`
truncation (~line 832, used for lightweight autocomplete/TigerPython parsing)
does `flatSlot.code.replace(/"[^"]+"/, "\"\"")`, which would blank a colour
literal's short hex string for no real benefit (it exists to strip huge base64
blobs, not 9-character strings). Consider gating it on `mediaType !== "colour"`
if it turns out to cause any visible issue; otherwise leave as-is.

## 8. Copy/paste & drag/drop within Strype — verify only, likely no changes

The generic `data-code`/`data-mediaType` round-trip in
`getFrameLabelSlotLiteralCodeAndFocus` (`editor.ts:410-416`) already treats any
`SlotType.media` uniformly — copying/pasting frames containing a colour literal
within Strype should work with no new code, same as images/sounds today. Confirm
with a manual/e2e test rather than code changes.

## 9. i18n

Add any new popup-header string (§5) to `src/localisation/en/en_main.json` under
`media` (existing keys `media.edit`/`media.preview` etc. are reusable as-is for
non-colour branches). Ideally also add to `fr/fr_main.json` (the colour picker
already has French strings under `colourPicker.*`). Other locales (`de`, `el`,
`es`, `zh`) fall back to English for missing keys — not blocking.

## 10. Edge cases to handle deliberately

- Prefixed strings (`f"..."`, `r"..."`, `b"..."`) must never auto-convert (§4 and
  §6 guards).
- Only exactly 6 hex digits after `#` — no 3-digit shorthand, no alpha channel,
  no CSS colour names auto-converting (only via the explicit picker, §3).
- Accept upper/lower/mixed case on input; normalise stored `code` to lowercase.
- Both `"` and `'` must be preserved through conversion (the `quote` field
  already carries the real character, not a UI glyph).
- Blur-conversion must be a single undo step (`saveStateChanges`); undo should
  cleanly restore the original string (automatic — whole-state snapshot).
- Typing `#aabbcc_foo` (i.e. no longer matching at blur time) must leave it as a
  plain string — the check only fires once, at blur, against the final content.
- Race condition: typing the last hex digit then immediately blurring in the same
  tick — verify ordering between the in-flight `onInput`-triggered reparse and
  the new blur-triggered one.
- A colour-looking string that is the *last* field in its label vs. not — confirm
  the inclusive cursor-bounds guard behaves correctly either way.

## 11. Testing

- Vitest unit tests: `isHexColourLiteral`; `pythonToFrames.ts` load-time
  conversion (plain string → colour; `f`/`r`/`b`-prefixed → unchanged;
  non-matching content → unchanged).
- Cypress/Playwright e2e:
  - type `#aabbcc` in a string, tab/click away → becomes a swatch
  - same but `f"#aabbcc"` → stays a plain string
  - Ctrl+Shift+Y outside a string → inserts swatch, cursor lands adjacent after it
  - Ctrl+Shift+Y inside an existing string → converts immediately, cursor lands
    adjacent after it (§3)
  - hover swatch → popup shows rectangle + Edit button → Edit reopens colour
    picker seeded correctly
  - load a `.py` file containing a bare `"#aabbcc"` string → renders as a colour
    literal
  - copy/paste a frame containing a colour literal (within Strype)
  - undo/redo across the auto-conversion
  - Python-export round-trip (`getFullCode()`) reproduces the exact original
    quoted string

## Suggested implementation order

1. `helpers/colour.ts` — `isHexColourLiteral` (§1).
2. `checkSlotRefactoring`/`parseCodeLiteral` — `treatAsBlurred` plumbing +
   conversion logic at `editor.ts:1740`, `onLoseCaret` trigger (§4) — the core
   new mechanic; everything else is comparatively mechanical once this exists.
3. New store action (`convertStringSlotToColourLiteral`) +
   `triggerColourPicker`'s two branches (§3).
4. `loadMediaPreview` swatch rendering (§5).
5. `MediaPreviewPopup.vue` colour branch + colour-picker injection (§5).
6. `pythonToFrames.ts` load-time detection (§6).
7. i18n strings (§9).
8. Manual verification of §7/§8 (should need no code changes), then the full
   test pass (§11).
