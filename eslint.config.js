// eslint.config.js
import vue from "eslint-plugin-vue";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";

export default [
    {
        ignores: [
            "dist/**",
            "build/**",
            "coverage/**",
            "node_modules/**",
            "**/*.min.js",
            "assets/**",
            "public/**/*.js",
        ],
    },
    {
        files: ["**/*.{js,ts,vue}"],

        languageOptions: {
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
                ecmaVersion: 2020,
                sourceType: "module",
            },
        },

        plugins: {
            vue,
            "@typescript-eslint": ts,
        },

        rules: {
            quotes: ["error", "double"],
            curly: "error",
            "brace-style": ["error", "stroustrup"],
            "arrow-parens": ["error", "always"],
            "function-call-argument-newline": ["error", "consistent"],
            "function-paren-newline": ["error", "consistent"],
            indent: ["error", 4, { FunctionDeclaration: { parameters: "first" } }],
            "comma-dangle": [
                "error", {
                    arrays: "always-multiline",
                    objects: "always-multiline",
                    imports: "always-multiline",
                    exports: "always-multiline",
                    functions: "never",
                },
            ],
            "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
            "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",

            semi: ["error", "always"],

            "@typescript-eslint/array-type": ["error", { default: "array" }],
            "@typescript-eslint/ban-ts-comment": "error",
            "@typescript-eslint/default-param-last": "error",
            "@typescript-eslint/explicit-module-boundary-types": "error",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-invalid-void-type": "error",
            "@typescript-eslint/no-namespace": "error",
            "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "error",
            "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/no-this-alias": "error",
            "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
            "@typescript-eslint/triple-slash-reference": "error",
        },
    },

    {
        files: [
            "**/tests/unit/**/*.spec.{j,t}s?(x)",
        ],

        languageOptions: {
            globals: {
                mocha: true,
            },            
        },
    },

    {
        files: ["*.ts", "*.mts", "*.cts", "*.tsx", "*.vue"],
        rules: {
            "no-undef": "off",
        },
    },
];