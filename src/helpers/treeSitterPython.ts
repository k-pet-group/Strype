import Parser from "web-tree-sitter";

// Loaded eagerly at app startup (see main.ts) so parsing is ready immediately when a paste/load
// happens, matching how skulpt.min.js/skulpt-stdlib.js were loaded eagerly before this migration.
// Both .wasm files are vendored under public/js/ (never fetched from a CDN) per the project's
// no-runtime-server-contact-for-JS/wasm principle -- see CLAUDE.md.
let resolvedLanguage: Parser.Language | undefined;

const pythonLanguagePromise: Promise<Parser.Language> = (async () => {
    // Tried lowering INITIAL_MEMORY below web-tree-sitter's default 32MB here, hoping to reduce
    // the per-page-load WASM footprint (every Cypress/Playwright test does a full page
    // navigation, re-triggering this eager load -- thousands of times across the suite). Not
    // possible: the compiled tree-sitter.wasm binary itself declares a hard minimum memory
    // import of 512 pages (32MB) -- confirmed by trying 128 pages (8MB) and getting a genuine
    // LinkError ("memory import has 128 pages which is smaller than the declared initial of
    // 512"), not just a soft default being overridden. 32MB is a floor, not a starting point.
    await Parser.init({
        locateFile: () => `${import.meta.env.BASE_URL}js/tree-sitter.wasm`,
    });
    const language = await Parser.Language.load(`${import.meta.env.BASE_URL}js/tree-sitter-python.wasm`);
    resolvedLanguage = language;
    return language;
})();

export async function getPythonParser(): Promise<Parser> {
    const language = await pythonLanguagePromise;
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
}

// Synchronous accessor for callers that can't await (pasteMixedPython() and its many call sites
// are synchronous throughout the app -- converting that whole chain to async would be a much
// larger, riskier change than this migration's actual scope). Safe in practice because parsing is
// eager-loaded at app startup (see startEagerLoad() below, called from main.ts before the UI
// becomes interactive), so by the time a user can trigger a paste/load, this promise has long
// since resolved. Throws only in the pathological case where parsing is somehow attempted before
// that eager load finishes.
export function getPythonParserSync(): Parser {
    if (!resolvedLanguage) {
        throw new Error("Python parser not yet loaded -- getPythonParserSync() called too early");
    }
    const parser = new Parser();
    parser.setLanguage(resolvedLanguage);
    return parser;
}

// Kick the load off immediately at module load time (eager, not on first use), and let callers
// await full readiness. main.ts awaits this before app.mount() -- unlike Skulpt's blocking
// `<script defer>` tags (which the browser guarantees finish before DOMContentLoaded, and hence
// before Vue mounts), this loading is fetch()-based and otherwise has no such guarantee, so
// without this await, getPythonParserSync() could be called (and throw) before the wasm has
// actually finished loading. Confirmed as a real, not just theoretical, race: it reproduced as a
// genuine CI failure (a load/paste silently failing -- caught into an error-message banner that
// the test never checks for -- immediately after a fast page load in Cypress, later in the same
// run than a slower first test that happened not to hit the race).
export async function startEagerLoad(): Promise<void> {
    try {
        await pythonLanguagePromise;
    }
    catch (err) {
        console.error("Failed to load tree-sitter Python grammar:", err);
    }
}
