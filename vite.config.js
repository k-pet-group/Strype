import { defineConfig } from "vite";
import { execSync } from "child_process";
import vue2 from  "@vitejs/plugin-vue2";
import path from "path";

export default defineConfig(({command}) => {
    // Environment variables for the Strype "platform" (standard Python or for micro:bit)
    const isPython = process.env.VITE_PYTHON === "true";
    const isMicrobit = process.env.VITE_MICROBIT === "true";
    
    return {
        plugins: [vue2()],        

        base: (process.env.VITE_GITHUB_PAGE)
            ? "/Strype/"
            : ((isPython)
                ? "/editor/"
                : "/microbit/"),

        // Global Vite define variables used in the application
        define: {
            __BUILD_DATE_TICKS__: Date.now(),
            __BUILD_GIT_HASH__: JSON.stringify(
                execSync("git rev-parse --short=8 HEAD").toString().trim()
            ),
            __IS_PYTHON__: isPython,
            __IS_MICROBIT__: isMicrobit,
        },

        resolve: {
            // So that we still have compilation of imports like: import { STRYPE_LOCATION } from "@/helpers/pythonToFrames"
            alias: {
                "@": path.resolve(__dirname, "src"),
            },
        },
    };
});
