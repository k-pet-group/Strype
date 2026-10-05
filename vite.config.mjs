import { defineConfig, loadEnv } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import ConditionalCompile from "vite-plugin-conditional-compiler";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { BootstrapVueNextResolver } from "bootstrap-vue-next/resolvers";
import fs from "fs";
import { zipDir } from "./scripts/zip-dir.js";
import checker from 'vite-plugin-checker';
import {randomUUID} from "node:crypto";

// Reads the exact resolved Pyodide version from package-lock.json -- must match the same lookup
// in scripts/download-pyodide-libs.cjs, which uses this same version as the folder name under
// public/pyodide/ (see the comment on indexURL in python-execution.ts for why: the folder needs a
// version segment so it's safe to cache indefinitely, and the two need to agree on that segment or
// the runtime will fetch a URL that was never downloaded there):
function getPyodideVersion() {
    const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package-lock.json"), "utf-8"));
    const version = lock.packages?.["node_modules/pyodide"]?.version ?? lock.dependencies?.pyodide?.version;
    if (!version) {
        throw new Error("Could not find pyodide version in package-lock.json");
    }
    return version;
}

// The Pyodide runtime files are only requested by the Python worker, which isn't created until the
// main bundle has downloaded and run -- so on a slow connection the two downloads happen one after
// the other. Preloading them from index.html starts them in parallel with the bundle instead. They
// are served with immutable caching (see the comment on indexURL in python-execution.ts), so the
// worker's own fetches are satisfied by the same HTTP cache entry (or share the in-flight request).
// "fetch" + crossorigin matches how the worker requests them, so the preload is actually reused:
function preloadPyodidePlugin() {
    const files = ["pyodide.asm.wasm", "python_stdlib.zip", "pyodide.asm.js", "pyodide-lock.json"];
    let base = "/";
    return {
        name: "preload-pyodide-plugin",
        configResolved(config) {
            base = config.base;
        },
        transformIndexHtml() {
            const version = getPyodideVersion();
            return files.map((file) => ({
                tag: "link",
                attrs: {rel: "preload", as: "fetch", crossorigin: "anonymous", href: `${base}pyodide/${version}/${file}`},
                injectTo: "head",
            }));
        },
    };
}

function zipPysrcPlugin() {
    let running = false;
    const run = async () => {
        if (running) {
            return;
        }
        running = true;
        // Important to write to a unique filename (which includes pysrc.zip for the check below to avoid infinite loop),
        // then rename atomically, in case multiple calls to this function overlap:
        const tempZip = path.resolve(`temp-${randomUUID()}-pysrc.zip`);
        await zipDir({
            rootDir: "pysrc",
            subdirs: ["strype", "python_runner", "turtle"],
            outFile: tempZip
        })
        await new Promise(resolve => setTimeout(resolve, 500));
        const dest = path.resolve("public/pysrc.zip");
        // On Windows, we must remove first before we can do the rename:
        await fs.promises.rm(dest, { force: true })
        await fs.promises.rename(tempZip, dest);
        running = false;
    };

    return {
        name: "zip-pysrc",

        async buildStart() {
            await run();
        },

        // Rerun when pysrc changes:
        async configureServer(server) {
            await run();

            server.watcher.add("pysrc/**");

            server.watcher.on("change", async (file) => {
                // Avoid an infinite regeneration loop when pysrc.zip is added,
                // and only regenerate when the pysrc dir changes, not when other files
                // are changed.
                if (!file.includes("pysrc.zip") && file.includes("pysrc")) {
                    await run();
                }
            });
        }
    }
}

// Taken from https://pyodide.org/en/0.29.0/usage/working-with-bundlers.html with a tweak to make paths work on Windows:
const PYODIDE_EXCLUDE = [
    "!**/*.{md,html}",
    "!**/*.d.ts",
    "!**/*.whl",
    "!**/node_modules",
];
export function viteStaticCopyPyodide() {
    const pyodideDir = path.dirname(fileURLToPath(import.meta.resolve("pyodide")));
    return viteStaticCopy({
        targets: [
            {
                // Important to use posix.join to get forward slashes instead of backslashes:
                src: [path.join(pyodideDir, "*").replaceAll("\\", "/")].concat(PYODIDE_EXCLUDE),
                dest: "assets",
            },
        ],
    });
}

function removeFilesPlugin(isStandardPython) {
    // The  library files we ship in the website depending on the platform we're on (standard Python or micro;bit).
    // This small plugin does just that.
    return {
        name: "remove-files-plugin",
        closeBundle() {
            const pathsToRemove = (isStandardPython)
                ? [
                    "./dist/demos/microbit",
                ]
                : [
                    "./dist/demos/console",
                    "./dist/demos/graphics",
                    "./dist/demos/turtle",
                    "./dist/graphics_images",
                    "./dist/sounds",
                    "./dist/public_libraries/strype",
                    "./dist/pyi",
                ];

            for (const p of pathsToRemove) {
                fs.rmSync(p,{recursive: true, force: true});
            }
        },
    };
}

// Writes a small, deliberately-unhashed version.json into the build output, containing the same
// git hash already baked into the JS bundle as __BUILD_GIT_HASH__ (see the "define" block below).
// A tab that's been open long enough to outlive a deploy periodically re-fetches this file (see
// startVersionCheck() in src/helpers/versionCheck.ts) to detect that a new version exists and
// prompt the user to reload -- which requires it to live at a stable, unhashed path (so the
// already-loaded page knows where to ask) and to never be long-cached (so the answer is actually
// current, not whatever was true when the page itself first loaded):
function writeVersionFilePlugin(gitHash) {
    return {
        name: "write-version-file",
        // Use writeBundle (not closeBundle) so we get the actual resolved output dir: this config
        // is also loaded, via vite's build() API, by scripts/build-service-worker.mjs to compile a
        // single worker file into a temp dir ahead of the real app build -- writing to a
        // hardcoded "dist/" there fails because the real dist/ doesn't exist yet at that point:
        writeBundle(options) {
            fs.writeFileSync(path.resolve(options.dir, "version.json"), JSON.stringify({gitHash}));
        },
    };
}

export default defineConfig(({mode}) => {
    // The environment variable for the Strype "platform" (standard Python or for micro:bit) is set in the scripts (STRYPE_PLATFORM)
    // We use environment variables for listing the possible values (for the code, the literal values are used only in the serve/build scripts...).
    const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
    const isStandardPython = process.env.STRYPE_PLATFORM === viteEnv.VITE_STANDARD_PYTHON_MODE;
    const gitHash = execSync("git rev-parse --short=8 HEAD").toString().trim();

    return {
        plugins: [
            ConditionalCompile(),
            vue(),
            Components({
                resolvers: [BootstrapVueNextResolver()],
            }),
            removeFilesPlugin(isStandardPython),
            viteStaticCopyPyodide(),
            zipPysrcPlugin(),
            preloadPyodidePlugin(),
            writeVersionFilePlugin(gitHash),
            // Ideally we want typescript: true, but only after finishing the Pyodide and Vue 3 work:
            checker({ typescript: false }),
        ],

        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `
                        @use "@/assets/style/variables" as *;
                    ` + (process.env.VITE_GITHUB_PAGE ?  `
                        @use "@/assets/style/test-watermark" as *;
                    ` : ""),
                },
            },
        },

        base: (process.env.VITE_GITHUB_PAGE)
            ? (process.env.VITE_GITHUB_PAGE_BRANCH ? `/Strype/${process.env.VITE_GITHUB_PAGE_BRANCH}/` : "/Strype/")
            : ((isStandardPython)
                ? "/editor/"
                : "/microbit/"),

        // Global Vite define variables used in the application
        define: {
            __BUILD_DATE_TICKS__: Date.now(),
            __BUILD_GIT_HASH__: JSON.stringify(gitHash),
            __PYODIDE_VERSION__: JSON.stringify(getPyodideVersion()),
        },

        resolve: {
            // So that we still have compilation of imports like: import { STRYPE_LOCATION } from "@/helpers/pythonToFrames"
            alias: {
                "@": path.resolve(__dirname, "src"),
                vue: "@vue/compat",
            },
        },

        // Inserts a literal, distinctive marker before the hash in every content-hashed output
        // filename (default template is "assets/[name]-[hash].js" etc. -- this just adds
        // "-vuehashed-" before "[hash]"). A production server can then reliably tell "this is a
        // hash Vite generated" apart from "this filename happens to look hash-shaped" -- e.g.
        // matching purely on shape (a hyphen followed by 6-12 alphanumeric characters) would also
        // match an ordinary hand-written name like my-javascript-codefile.js ("-codefile" fits
        // that shape too), and separately, vite-plugin-static-copy's raw Pyodide files land in
        // this same assets/ directory unmodified (see viteStaticCopyPyodide() below) -- today
        // none of their names happen to fit the shape either, but that's incidental, not
        // guaranteed, and a future Pyodide release could easily ship one that does. Requiring
        // this exact marker makes both false-positive risks structural instead of coincidental:
        // only Vite's own hashing ever produces it, so nothing else ever will:
        build: {
            rollupOptions: {
                output: {
                    entryFileNames: "assets/[name]-vuehashed-[hash].js",
                    chunkFileNames: "assets/[name]-vuehashed-[hash].js",
                    assetFileNames: "assets/[name]-vuehashed-[hash][extname]",
                },
            },
        },

        optimizeDeps: { exclude: ["pyodide"] },

        worker: { format: 'es' },

        server: {
            hmr: mode !== "e2e", // disable HMR during Cypress
            watch: mode !== "e2e" ? undefined : { // This is also needed to disable HMR
                 ignored: ['**/*']
            }
        }
    };
});
