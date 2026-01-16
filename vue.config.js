/* eslint @typescript-eslint/no-var-requires: "off" */
const RemoveFilePlugin = require("remove-files-webpack-plugin");
/* eslint @typescript-eslint/no-var-requires: "off" */
const fs = require("fs");
/* eslint @typescript-eslint/no-var-requires: "off" */
const path = require("path");

// Application environment variable for the built date/hash.
// The idea is to have a date value and hash at build time, so
// we don't need to manually set a release date or copy the hash.
// Note: the version number, visible to users, is in package.json
// and it is updated *MANUALLY* there when needed to be changed.
process.env.VUE_APP_BUILD_DATE_TICKS = Date.now();
process.env.VUE_APP_BUILD_GIT_HASH = require("child_process").execSync("git rev-parse --short=8 HEAD").toString().trim();

const configureWebpackExtraProps = 
    {
        plugins: [
            // We don't need our Strype librairies and standard examples for micro:bit
            // Conversely, we don't need micro:bit-specific libraries and examples for the standard version
            new RemoveFilePlugin({
                after: {                    
                    include: (process.env.npm_config_microbit)
                        ? ["./dist/demos/console", "./dist/demos/graphics", "./dist/demos/turtle", "./dist/graphics_images", "./dist/sounds", "./dist/public_libraries/strype", "./dist/pyi"]
                        : ["./dist/demos/microbit", "./dist/public_libraries/microbit"],
                    trash: false,
                },
            }),
        ],
    };

if (process.env.npm_config_microbit){
    // We have a small issue with the micro:bit file generation: we delete the Strype Media API files in dist/ 
    // because they are not used by Strype. But the builder looks for it (JS files notably) when showing some stats.
    // So we make sure the stats ignore them.
    configureWebpackExtraProps.plugins.push({
        apply(compiler) {
            compiler.hooks.done.tap("SkipGzipSizeForDeletedFiles", (stats) => {
                const compInfo = stats.compilation;
                const targetPathToIgnore = "public_libraries/strype/";
                if(compInfo.assetsInfo){          
                    for (const [name] of compInfo.assetsInfo.entries()) {
                        if (typeof name == "string" && name.startsWith(targetPathToIgnore)) {
                            compInfo.deleteAsset(name);
                        }
                    }
                }                
            });
        },
    });
}

module.exports = {
    configureWebpack: {
        devtool: "source-map",
        resolve: {
            extensions: [ ".ts", ".js", ".py", ".pyi" ],
        },
        // Don't try to include pyodide, as we bundle and reference it ourselves at a custom path inside public. 
        // pyodide-worker-runner doesn't actually need it as a dependency, because of this.
        // TODO Vite might be different?
        externals: {
            "pyodide": "globalThis.pyodide",
        },
        ...configureWebpackExtraProps,
        // allows pinia to compile fine (https://github.com/vuejs/pinia/issues/675)
        module: {
            rules: [
                {
                    test: /\.mjs$/,
                    include: /node_modules/,
                    type: "javascript/auto",
                },
                {
                    test: /\.pyi?$/,
                    use: "raw-loader",
                },
            ],
        },
    },

    chainWebpack: (config) => {
        config.module
            .rule("conditionalCompilerVue")
            .test(/\.vue$/)
            .use("vue-loader")
            .loader("js-conditional-compile-loader")
            .options( {
                // the following are from the library js-conditional-compile-loader https://github.com/hzsrc/js-conditional-compile-loader
                isPython: process.env.npm_config_python,
                isMicrobit: process.env.npm_config_microbit,
            });
        config.module
            .rule("conditionalCompilerTS")
            .test(/\.ts$/)
            .use("vue-loader")
            .loader("js-conditional-compile-loader")
            .options( {
                isPython: process.env.npm_config_python,
                isMicrobit: process.env.npm_config_microbit,
            });
        config.plugin("copy").tap(([options]) => {
            if(process.env.npm_config_python) {
                options.patterns[0].globOptions.ignore.push("pythonLib/**");
            }
            return [options];
        });

        // TODO Vite
        config.plugin("copy-sw-after-emit")
            .use(class {
                apply(compiler) {
                    // To get the service worker working in webpack in dev mode, we have to copy to the public
                    // directory.  This should be removed once we swap to Vite in future.
                    compiler.hooks.afterEmit.tap("CopySWAfterEmit", (compilation) => {
                        const swPath = path.resolve(__dirname, "dist/service-worker.js");
                        const dest = path.resolve(__dirname, "public/service-worker.js");
                        if (fs.existsSync(swPath)) {
                            fs.copyFileSync(swPath, dest);
                            console.log("Service worker copied to public/service-worker.js");
                        }
                    });
                }
            });
        
        // From https://stackoverflow.com/questions/61031121/vue-js-with-mocha-and-styles-resources-loader-cant-load-dependency-sass
        if (process.env.NODE_ENV === "test") {
            const scssRule = config.module.rule("scss");
            scssRule.uses.clear();
            scssRule.use("null-loader").loader("null-loader");
        }
    },

    publicPath: (process.env.npm_config_githubpages) ? "/Strype/" : ((process.env.npm_config_python)?"/editor/":"/microbit/"),
    pluginOptions: {
        i18n: {
            locale: "en",
            fallbackLocale: "en",
            localeDir: "localisation",
            enableInSFC: false,
        },
    },
    
    // TODO Vite
    pwa: {
        workboxPluginMode: "InjectManifest",
        workboxOptions: {
            swSrc: "./src/workers/service-worker.ts",
            swDest: "service-worker.js",
        },
        // Explicitly allow registration in dev
        devOptions: {
            enabled: true,
            type: "module",  // Makes SW support ESM in browsers
        },
    },

    css: {
        loaderOptions: {
            scss: {
                additionalData: `
                    @import "@/assets/style/variables.scss";
                ` + (process.env.npm_config_githubpages ?  `
                    @import "@/assets/style/test-watermark.scss";
                ` : ""),
            },
        },
    },
};
