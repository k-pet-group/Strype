// This helper file is made to ease HTML elements' ID and Strype's CSS classes' names
// accross the Strype code base AND with the tests.
// For IDs: those not shared with tests are in editor.ts
// For CSS: we just share the SCSS variables (JS) directly
// NOTE: for making this file easily imported in the tests, keep it without any import
// that involves Vue.
export const WINDOW_STRYPE_SCSSVARS_PROPNAME = "StrypeSCSSVarsGlobals";
export const WINDOW_STRYPE_HTMLIDS_PROPNAME = "StrypeHTMLELementsIDsGlobals";
export const WINDOW_STRYPE_NEXTTICK_PROPNAME = "StrypeNextTickGlobal";
