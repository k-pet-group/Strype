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
                    "./dist/public_libraries/microbit",
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

export default defineConfig(({mode}) => {
    // The environment variable for the Strype "platform" (standard Python or for micro:bit) is set in the scripts (STRYPE_PLATFORM)
    // We use environment variables for listing the possible values (for the code, the literal values are used only in the serve/build scripts...).
    const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
    const isStandardPython = process.env.STRYPE_PLATFORM === viteEnv.VITE_STANDARD_PYTHON_MODE;
  
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
            ? "/Strype/"
            : ((isStandardPython)
                ? "/editor/"
                : "/microbit/"),

        // Global Vite define variables used in the application
        define: {
            __BUILD_DATE_TICKS__: Date.now(),
            __BUILD_GIT_HASH__: JSON.stringify(
                execSync("git rev-parse --short=8 HEAD").toString().trim()
            ),
        },

        resolve: {
            // So that we still have compilation of imports like: import { STRYPE_LOCATION } from "@/helpers/pythonToFrames"
            alias: {
                "@": path.resolve(__dirname, "src"),
                vue: "@vue/compat",
            },
        },

        optimizeDeps: { exclude: ["pyodide"] },

        worker: { format: 'es' },
    };
});
