/* eslint @typescript-eslint/no-var-requires: "off" */
const RemoveFilePlugin = require("remove-files-webpack-plugin");

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
                        : ["./dist/demos/microbit", "./dist/public/public_libraries/microbit"],
                    trash: true,
                },
            }),
        ],
    };

module.exports = {
    configureWebpack: {
        devtool: "source-map",
        resolve: {
            extensions: [ ".ts", ".js", ".py", ".pyi" ],
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
