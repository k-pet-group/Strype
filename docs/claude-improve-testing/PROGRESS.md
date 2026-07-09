# Progress tracking

Snapshot taken 2026-07-09 with:

```
rg '\.wait\(\s*\d|waitForTimeout\(\s*\d' tests
```

729 occurrences across 42 files. Counts are hard-coded numeric waits only —
`cy.wait("@alias")` (waiting on a network intercept) is already correct
practice and is **not** counted or in scope.

Re-run the command above before resuming, since counts will drift as the
conversion progresses and as specs change for unrelated reasons. Check a box
and add a one-line note when a file is done; if some waits in a file were
deliberately kept, say why instead of checking it off as fully done.

## Shared support/helper files (do these first — see PLAN.md)

| Done | File | Waits (snapshot) | Notes |
|---|---|---|---|
| [ ] | `tests/playwright/support/editor.ts` | 5 | keypress/paste helpers, see RECIPES.md |
| [ ] | `tests/playwright/support/loading-saving.ts` | 4 | |
| [ ] | `tests/playwright/support/dividers.ts` | 3 | drag-settle waits, see RECIPES.md |
| [ ] | `tests/cypress/support/paste-test-support.ts` | 5 | paste/save/load round trip, see RECIPES.md |
| [ ] | `tests/cypress/support/expression-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/autocomplete-test-support.ts` | 3 | |
| [ ] | `tests/cypress/support/param-prompt-support.ts` | 3 | |
| [ ] | `tests/cypress/support/load-save-support.ts` | 1 | |

## Spec files (descending count — see PLAN.md for why this order)

| Done | File | Waits (snapshot) | Notes |
|---|---|---|---|
| [ ] | `tests/playwright/e2e/rename-identifiers.spec.ts` | 139 | |
| [ ] | `tests/playwright/e2e/match-statement.spec.ts` | 105 | |
| [ ] | `tests/playwright/e2e/graphics.spec.ts` | 41 | |
| [ ] | `tests/playwright/e2e/structured-expressions.spec.ts` | 35 | |
| [ ] | `tests/playwright/e2e/structured-expressions-media.spec.ts` | 32 | |
| [ ] | `tests/cypress/e2e/autocomplete-modules.cy.ts` | 32 | |
| [ ] | `tests/playwright/e2e/structured-expressions-navigation.spec.ts` | 31 | |
| [ ] | `tests/cypress/e2e/autocomplete-graphics-libs.cy.ts` | 29 | |
| [ ] | `tests/cypress/e2e/media-literals.cy.ts` | 29 | |
| [ ] | `tests/playwright/e2e/description-fields.spec.ts` | 27 | |
| [ ] | `tests/playwright/e2e/load-save-random.spec.ts` | 23 | |
| [ ] | `tests/playwright/e2e/load-save-dividers.spec.ts` | 21 | uses dividers.ts helper above |
| [ ] | `tests/cypress/e2e/autocomplete-user-defined.cy.ts` | 21 | |
| [ ] | `tests/playwright/e2e/structured-expressions-selection.spec.ts` | 16 | |
| [ ] | `tests/cypress/e2e/autocomplete.cy.ts` | 15 | |
| [ ] | `tests/cypress/e2e/translation.cy.ts` | 13 | |
| [ ] | `tests/playwright/e2e/structured-expressions-copy-paste.spec.ts` | 12 | |
| [ ] | `tests/playwright/e2e/frame-selection-manipulation.spec.ts` | 10 | |
| [ ] | `tests/playwright/e2e/storage-model.spec.ts` | 9 | |
| [ ] | `tests/cypress/e2e/autocomplete-more.cy.ts` | 8 | |
| [ ] | `tests/playwright/e2e/slot-errors.spec.ts` | 7 | |
| [ ] | `tests/playwright/e2e/scroll-into-view.spec.ts` | 7 | |
| [ ] | `tests/playwright/e2e/load-save-frozen-collapsed.spec.ts` | 7 | |
| [ ] | `tests/cypress/e2e/paste-python.cy.ts` | 7 | uses paste-test-support.ts helper above |
| [ ] | `tests/cypress/e2e/basics.cy.ts` | 6 | |
| [ ] | `tests/playwright/e2e/load-save-demos-books.spec.ts` | 5 | |
| [ ] | `tests/playwright/e2e/console-execution.spec.ts` | 3 | |
| [ ] | `tests/cypress/e2e/graphics.cy.ts` | 3 | |
| [ ] | `tests/playwright/e2e/load-save-share.spec.ts` | 2 | |
| [ ] | `tests/cypress/e2e/load-save-share.cy.ts` | 2 | |
| [ ] | `tests/cypress/e2e/load-save.cy.ts` | 2 | |
| [ ] | `tests/cypress/e2e/structured-expressions-selection.cy.ts` | 1 | |
| [ ] | `tests/cypress/e2e/demos.cy.ts` | 1 | |
| [ ] | `tests/cypress/e2e/paste-python-misc.cy.ts` | 1 | |

## Log

Add a dated entry each session summarising what was converted, any new
pattern discovered (worth folding back into RECIPES.md), and any waits
deliberately left in place with a reason.

- 2026-07-09 — Planning only. Wrote PLAN.md, RECIPES.md, this file, and the
  root CLAUDE.md pointer. No conversions done yet.
