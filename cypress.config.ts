import { defineConfig } from "cypress";
import {rimraf} from "rimraf";
import fs from "fs";
const cypressSplit = require("cypress-split");

export default defineConfig({
    retries: 1,
    downloadsFolder: "tests/cypress/downloads",
    fixturesFolder:	"tests/cypress/fixtures",
    screenshotsFolder: "tests/cypress/screenshots",
    supportFolder: "tests/cypress/support",
    videosFolder: "tests/cypress/videos",
    video: true,
    e2e: {
        experimentalMemoryManagement: true,
        specPattern: "tests/cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
        supportFile: false,
        // Inspired by https://docs.cypress.io/api/plugins/configuration-api#Usage
        setupNodeEvents(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions) {
            require("cypress-terminal-report/src/installLogsPrinter")(on, {defaultTrimLength: 5000});

            on("task", {
                deleteFile(filePath) {

                    return new Promise((resolve, reject) => {
                        rimraf(filePath, {maxRetries: 10}).then(()=>resolve(null), (err) => {
                            if (err && !err.message.startsWith("ENOENT")) {
                                console.error(err);
                                return reject(err);
                            }
                            resolve(null);
                        });
                    });
                },
                renameFile(args: {srcPath: string, destPath: string}) {
                    fs.renameSync(args.srcPath, args.destPath);
                    return null;
                },
            });
            // Allow logging to console (although only the first message seems to get logged?)
            on("task", {
                log (message) {
                    console.log(message); 
                    return null;
                },
            });

            // downloads is a task which lists all the files in the Cypress downloads directory:
            on("task", {
                downloads:  () => {
                    return new Promise((resolve, reject) => {
                        fs.readdir("tests/cypress/downloads", (err, files) => {
                            if (err) {
                                return reject(err);
                            }

                            resolve(files);
                        });
                    });
                },
            });

            const specFromEnv = process.env.SPEC;
            if (specFromEnv) {
                config.specPattern = "tests/cypress/e2e/" + specFromEnv;
            }
            
            cypressSplit(on, config);
            
            config.baseUrl = config.env.mode == "microbit" ? "http://localhost:8081/microbit/" : "http://localhost:8081/editor/";
            return config;
        },
    },
});
