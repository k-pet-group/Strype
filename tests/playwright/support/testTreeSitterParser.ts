import Parser from "web-tree-sitter";
import path from "path";

// Shared, memoized tree-sitter setup for pure-function unit specs (python-to-frames-expr.spec.ts,
// python-to-frames-block-walk.spec.ts) that need a real parser to produce nodes to test against,
// loaded directly from node_modules rather than through src/helpers/treeSitterPython.ts (which
// assumes a browser: import.meta.env.BASE_URL, fetch).
//
// Each spec file used to call Parser.init() itself in its own beforeAll. That's broken when both
// spec files run in the same worker process: web-tree-sitter's Parser.init() is only safe to call
// once per process (confirmed by reproducing locally, single-worker, no CI resource pressure
// involved) -- a second, independent init() call in a second spec file throws "TypeError:
// _webTreeSitter.default.init is not a function" instead of returning the already-initialised
// parser. Memoizing the init here so all specs share one call fixes it at the root rather than
// working around the symptom.
let parserPromise: Promise<Parser> | undefined;

export function getTestPythonParser(): Promise<Parser> {
    if (!parserPromise) {
        parserPromise = Parser.init().then(() => Parser.Language.load(
            path.resolve(__dirname, "../../../node_modules/tree-sitter-wasms/out/tree-sitter-python.wasm")
        )).then((lang) => {
            const parser = new Parser();
            parser.setLanguage(lang);
            return parser;
        });
    }
    return parserPromise;
}
