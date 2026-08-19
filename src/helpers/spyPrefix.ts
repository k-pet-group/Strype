// The SPY directive prefix, split out into its own leaf module (no imports) so it can be used
// from code that must stay Vitest-unit-testable without pulling in the app's circular
// types<->store<->storeMethods<->parser<->editor import graph -- see appContext.ts, which
// re-exports these for the rest of the app.
export const AppSPYPrefix = "(=>";
export const AppSPYFullPrefix = "#" + AppSPYPrefix;
