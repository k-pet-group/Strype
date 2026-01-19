import { defineConfig, loadEnv } from "vite";
import { execSync } from "child_process";
import vue2 from  "@vitejs/plugin-vue2";
import path from "path";
import ConditionalCompile from "vite-plugin-conditional-compiler";


export default defineConfig(({mode, command}) => {
    // Mode for the Strype "platform" (standard Python or for micro:bit)
    // We use environment variables for the possible values (only exception is in the serve/build scripts...)
    const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
    const isStandardPython = mode === viteEnv.VITE_STANDARD_PYTHON_MODE;
    
    return {       
        plugins: [
            ConditionalCompile(),            
            vue2(),
        ],

        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `
                        @import "@/assets/style/variables.scss";
                    ` + (process.env.VITE_GITHUB_PAGE ?  `
                        @import "@/assets/style/test-watermark.scss";
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
            },
        },
    };
});
