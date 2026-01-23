// Test that the translation is working properly
import path from "path";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";
import zh from "@/localisation/zh/zh_main.json";
import fr from "@/localisation/fr/fr_main.json";
import de from "@/localisation/de/de_main.json";

import {expect} from "chai";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";

/**
 * Given a JQuery with multiple results and an array of expected string content,
 * checks that the two are the same size and that the text() of each JQuery result matches the
 * corresponding expected string content.
 */
function checkTextEquals(ws: JQuery, expecteds : string[]) : void {
    expect(ws.length).to.equal(expecteds.length);
    for (let i = 0; i < ws.length; i++) {
        expect(ws.eq(i).text()).to.equal(expecteds[i]);
    }
}

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => string};
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {       
        // Only need to get the global variables if we haven't done so
        if(scssVars == undefined){
            cy.window().then((win) => {
                scssVars = (win as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME];
                strypeElIds = (win as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME];
            });
        }
    });
});

// Helper method that needs to be called in a test before typing text in Strype
// (not clear why, but it's just required... otherwise when a typing triggers a frame addition, following typing fails)
function focusEditor(): void {
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
}

function getLocalisedString(keyPath: string, locale: string="en"): string{
    // We use a hard coded way to get the localised value here as with Vite we no longer rely on the Vue i18n import anymore.
    const locales: Record<string, any> = {
        en,
        fr,
        zh,
        de,
    };
    let localeJson = locales[locale];

    const keys = keyPath.split(".");
    for (let key of keys){
        localeJson = (localeJson as any)[key];
        // If ever a localised entry doesn't exist, we fall back on English, like vue 18n does:
        // (of course we assume English is fully valid!)
        if(localeJson == undefined){
            localeJson = getLocalisedString(keyPath) as any;
            break;
        }
    }

    return localeJson as any;
}

// This method expected the frame cursor to be at the start of "my code":
// it will test the frame container labels as well as the autocompletion
function checkTranslationsForLocale(locale: string): void {    
    // Check that the sections are present and translated:
    cy.get("."+ scssVars.frameContainerLabelSpanClassName).should((hs) => checkTextEquals(hs, [getLocalisedString("appMessage.importsContainer", locale), getLocalisedString("appMessage.defsContainer", locale), getLocalisedString("appMessage.mainContainer", locale)]));

    // Check that sections in the autocomplete are translated:
    // Add a function:
    cy.get("body").type("{uparrow}ffoo{downarrow}{downarrow}");
    // And a variable:
    cy.get("body").type("{downarrow}=bar=3{rightarrow}");
    // Then trigger autocomplete:
    cy.get("body").type(" {ctrl} ");
    // And check the sections:
    const expAuto = [getLocalisedString("autoCompletion.myVariables", locale), getLocalisedString("autoCompletion.myFunctions", locale)];
    if (Cypress.env("mode") === "microbit") {
        expAuto.push("microbit");
    }
}

// This method checks English (initial situation) is selected and showing, 
// and swap Strype to a given locale, then check translations for that given locale.
function changeLocaleAndCheckTranslations(locale: string): void {
    // Starts as English:
    cy.get("." + scssVars.frameContainerLabelSpanClassName).should((hs) => checkTextEquals(hs, [getLocalisedString("appMessage.importsContainer"), getLocalisedString("appMessage.defsContainer"), getLocalisedString("appMessage.mainContainer")]));
    cy.get("select#" + strypeElIds.getAppLangSelectId()).should("have.value", "en");

    // Swap to another locale and check it worked:
    cy.get("button#" + strypeElIds.getEditorMenuUID()).click();
    cy.get("select#" + strypeElIds.getAppLangSelectId()).select(locale);
    cy.get("select#" + strypeElIds.getAppLangSelectId()).should("have.value", locale);
    
    // Close the menu:
    cy.get("body").type("{esc}");
    cy.wait(1000);

    // Check translations
    checkTranslationsForLocale(locale);
}

// This methods edits the Strype code with the given code change (if any), then download the converted Python file.
// The locale can be specified as we rely on a translation to find the "convert" button (English is used by default).
// We may want to rename the downloaded file (it seems Cypress overwrites files).
const downloadsFolder = Cypress.config("downloadsFolder");
function changeCodeThenDownloadPy(parameters?: {locale?: string, renamedFileName?: string, codeChangeStrSequence?: string}): void {
    const dowloadingActions = () => {
        cy.log("deleting the python file");
        cy.task("deleteFile", path.join(downloadsFolder, "main.py"));
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true}); 
        cy.contains(getLocalisedString("appMenu.downloadPython", (parameters?.locale)??"en")).click({force: true});
        // If we request the file to be renamed, we rename it after a short wait (for download to be done)
        if(parameters?.renamedFileName) {
            cy.wait(2000);
            cy.task("renameFile", {srcPath: path.join(downloadsFolder, "main.py"), destPath: path.join(downloadsFolder, parameters.renamedFileName)});
        }
    };

    
    if(parameters?.codeChangeStrSequence){
        cy.get("body").type(parameters.codeChangeStrSequence);
        cy.wait(500);
        dowloadingActions();
    
    }
    else{
        dowloadingActions();
    }    
}
  
describe("Translation tests", () => {
    it("Translates correctly", () => {
        changeLocaleAndCheckTranslations("fr");
    });

    it("Resets translation properly", () => {
        // Should be back to English:
        checkTranslationsForLocale("en");
        cy.get("select#" + strypeElIds.getAppLangSelectId()).should("have.value", "en");
    });
});

describe("Locale persistence", () => {
    // These tests are a sort of a combination of the two tests of the previous describe() BUT without a local storage clearance.
    // We want to verify that the locale selected by a user is kept in the local storage and used properly with another Strype/project load.
    // 3 cases are tested: resetting to a new project, reloading the current page (like refreshing the browser) and loading a project
    // in an existing Strype session.

    it("Keeps locale after resetting to new project", () => {
        // Preparation: download the Python conversion of the intial Strype code for comparison later.
        // It seems headless Cypress overwrites downloaded files with same name, so we rename the file for backup.
        const initialPyFileName = "main-init.py";
        changeCodeThenDownloadPy({renamedFileName: initialPyFileName});

        // Part 1: change locale (duplicate test "Translates correctly" with another language for fun)
        const localeForTest = "zh";
        changeLocaleAndCheckTranslations(localeForTest);

        // Part 2: resetting the editor ("New Project" in menu), the code should be in the initial state (we have changed it in part 1)
        // but the locale should still be the same as before.
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true}); 
        cy.contains(getLocalisedString("appMenu.resetProject", localeForTest)).click({force: true}).then(() => {
            // Accept the change for a new project
            cy.wait(500);
            return cy.contains(getLocalisedString("buttonLabel.yes", localeForTest)).click({force: true}).then(() => {
                // Check the editor contains the initial state code: we download the conversion and compare with the backed up Python file
                changeCodeThenDownloadPy({locale: localeForTest});
                cy.wait(500);            
                return cy.readFile(path.join(downloadsFolder, initialPyFileName)).then((intialPyFileContent : string) =>  {
                    return cy.readFile(path.join(downloadsFolder, "main.py")).then((newPyFileContent : string) =>  {
                        expect(newPyFileContent, "Reset project's Python file differs from intial project's Python file").to.equal(intialPyFileContent);
                        // Check the page is still in the previously selected locale
                        checkTranslationsForLocale(localeForTest);
                        // Clean up the downloads folder for the backed up file (not sure we need though)
                        cy.task("deleteFile", path.join(downloadsFolder, initialPyFileName)); 
                    });                
                });
            });            
        });
    });

    
    it("Keeps locale after reloading website", () => {
        // Part 1: change locale (duplicate test "Translates correctly" with another language for fun)
        const localeForTest = "zh";
        changeLocaleAndCheckTranslations(localeForTest);

        // Part 2: instead of starting off a new test state (as enforced by beforeEach()) we simply visit the page again
        cy.visit("/").then(() => {       
            // Check the page is still in the previously selected locale
            checkTranslationsForLocale(localeForTest);
        });
    });

    
    
    it("Keeps locale after loading a project", () => {
        focusEditor();
        const localeForTest = "de", englishPyFileName = "main-english.py";
        
        // Preparation 1 : we will need to check a file that was created while Strype was in English, later with another locale.
        // We just edit something (remove existing code, add a varassign and a function call) and save the converted Python file for reusing it later.
        // We make sure the frame cursor is back to the start of "my code".
        changeCodeThenDownloadPy({renamedFileName:englishPyFileName, codeChangeStrSequence: "{del}{del}=testvar=\"this is done in English Strype.{downarrow} test{uparrow}{uparrow}"});
        // Now save the spy project so we can reload it later. With Cypress, saving in the file system is directly saving in the download folder,
        // with the name of the project (so we keep it as "My project").
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true}); 
        cy.wait(200);
        cy.contains(getLocalisedString("appMenu.saveProject")).click({force: true});
        cy.get("#" + strypeElIds.getSaveStrypeProjectToFSButtonId()).click({force: true});
        cy.wait(500);
        cy.get("#" + strypeElIds.getStrypeSaveProjectNameInputId()).type("{enter}");
        cy.wait(200);
      
        // Preparation 2: to make sure that later we load the right file content, we start off with an empty content
        cy.get("body").type("{ctrl}a").type("{del}");
        cy.wait(100);

        // Part 1: change locale (duplicate test "Translates correctly" with another language for fun)
        changeLocaleAndCheckTranslations(localeForTest);
        cy.wait(500);

        // Part 2 : open the project saved in Preparation 1 and check that content is compliant, locale isn't changed.
        // Due to the Cypress environment, we need to by-pass Strype's mechanism that opens the file selector via the UI.
        // Instead, we directly use Strype's input-file HTML element that would be used in a normal workflow.
        cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(path.join(downloadsFolder, "My project.spy"), {force: true});
        // Wait a bit for the download, and compare that ... 
        cy.wait(1000);
        // 1) the file content is the same as expected (and they aren't empty!)
        changeCodeThenDownloadPy({locale: localeForTest});
        cy.wait(500);          
        cy.readFile(path.join(downloadsFolder, englishPyFileName)).then((englishPyFileContent : string) => {
            return cy.readFile(path.join(downloadsFolder, "main.py")).then((newPyFileContent : string) =>  {
                expect(newPyFileContent, "Loaded project's Python file differs from original project's Python file.").to.equal(englishPyFileContent);   
                expect(newPyFileContent, "Loaded project (and original project) should not be empty").to.not.empty;             
            });
        });        
           

        // 2) the locale is correct (usual test + the function call placeholder text, which is in frame 4 for normal editor, and 5 for microbit because of import)
        checkTranslationsForLocale(localeForTest);
        cy.get("span[placeholder='" + getLocalisedString("frame.defaultText.funcCall", localeForTest) + "']").should("exist");
            
        // Clean up the downloads folder for the backed up files (not sure we need though)
        cy.task("deleteFile", path.join(downloadsFolder, englishPyFileName));
        cy.task("deleteFile", path.join(downloadsFolder, "My project.spy"));
        
    }); 
});
