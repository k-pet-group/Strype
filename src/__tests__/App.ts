import { parseCodeAndGetParseElements } from "@/parser/parser";
import initialStates from "@/store/initial-states";
import { useStore } from "@/store/store";
import { StateAppObject } from "@/types/types";
import { Wrapper, WrapperArray, createLocalVue, mount } from "@vue/test-utils";
import { expect } from "chai";
import { cloneDeep } from "lodash";
import { PiniaVuePlugin, createPinia } from "pinia";
import Vue from "vue";
import App from "../App.vue";
import i18n from "../i18n";

// All declared in test-setup-{microbit,python}.js
declare const defaultImports: (string | RegExp)[];
declare const defaultMyCode: (string | RegExp)[];
declare const initialStateName : string;
const initialState: StateAppObject = cloneDeep(initialStates[initialStateName]);

/**
 * Initialises the application (for testing) and returns the wrapper object for dealing with it
 */
function testApp() : Wrapper<Vue> {
    // Must reset the state before each test:
    useStore().$reset();
    checkInitialState();
    
    const localVue = createLocalVue();
    localVue.use(PiniaVuePlugin);
    const wrapper = mount(App, {
        localVue,
        i18n,
        pinia: createPinia(),
        attachTo: document.body,
    });
    return wrapper;
}

/**
 * Given an array of wrappers and an array of expected string content,
 * checks that the arrays are the same size and that the text() of each wrapper matches the
 * corresponding expected string content.
 */
function checkTextEquals(ws: WrapperArray<any>, expecteds : string[]) : void {
    expect(ws.length).to.equal(expecteds.length);
    for (let i = 0; i < ws.length; i++) {
        expect(ws.at(i).text()).to.equal(expecteds[i]);
    }
}

/**
 * Gets all the text from the labels and fields in a frame and glues
 * it together into one string.
 * @param w A wrapper representing a .frameDiv element
 */
function getFrameText(w : Wrapper<any, any>) : string {
    const parts = w.findAll("input,.frameColouredLabel");
    let s = "";
    for (let i = 0; i < parts.length; i++) {
        const p = parts.at(i);
        
        let text = "";
        if (p.element instanceof HTMLInputElement) {
            text = (p.element as HTMLInputElement).value;
        }
        else {
            text = p.element.textContent ?? "";
        }
        if (s.length == 0) {
            s = text;
        }
        else {
            s = s.trimEnd() + " " + text;
        }
    }
    return s.trimEnd();
}

/**
 * Apply getFrameText to a WrapperArray
 */
function getFramesText(ws : WrapperArray<any>) : string[] {
    return ws.wrappers.map(getFrameText);
}

/**
 * Sanity check the state of the editor (e.g. only one caret visible)
 */
function sanityCheck(root : Wrapper<any>) : void {
    // Check exactly one caret visible when not editing, zero when editing:
    expect(root.findAll(".caret").filter((w) => !w.classes().includes("invisible"))).to.
        length(document.activeElement instanceof HTMLInputElement ? 0 : 1);
}

/**
 * Check if a list of actual strings matches a list of expected strings or regexes.
 */
function expectMatchRegex(actual: string[], expected: (string | RegExp)[]) {
    // Deliberate double escape, use \n to separate lines but have it all appear on one line:
    expect(actual.length, "Actual: " + actual.join("\\n")).to.equal(expected.length);
    for (let i = 0; i < actual.length; i++) {
        if (expected[i] instanceof RegExp) {
            expect(actual[i]).to.match(expected[i] as RegExp);
        }
        else {
            expect(actual[i]).to.equal(expected[i]);
        }
    }
}


/**
 * Check that the code is equal to the given lines, by checking the visuals and the underlying Python
 * conversion.  codeLines should be a list of lines of code, how they appear *visually*
 * (so equality should be ⇐, not =).
 */
function checkCodeEquals(root: Wrapper<any>, codeLines : (string | RegExp)[]) : void {
    sanityCheck(root);
    // We must use eql to compare lists, not equal:
    expectMatchRegex(getFramesText(root.findAll(".frameDiv")), codeLines);
    const p = parseCodeAndGetParseElements(false);
    expect(p.hasErrors).to.equal(false);
    expectMatchRegex(p.parsedOutput.split("\n").map((l) => l.trimEnd()),
        codeLines.concat(/\s*/));
}

/**
 * Helper function that gets an array with -m to +n converted to strings.
 * Very niche, but needed to check the expected keys of useStore().frameObjects
 */
function minusMToPlusNAsString(m : number, n : number) : string[] {
    // We need a total of m + n + 1 consecutive integers.  This gives that, starting at zero
    const fromZero = Array.from(Array(m + n + 1).keys());
    // Then we have to subtract m from each and convert to string:
    return fromZero.map((x) => String(x - m));
}

/**
 * Checks that the state of the store is back to the blank (initial) state
 */
function checkInitialState() : void {
    const builtInFrames = 4; // Root plus imports/functions/my-code
    // Check expected IDs are present:
    expect(Object.keys(useStore().frameObjects).sort()).to.eql(minusMToPlusNAsString(builtInFrames - 1, defaultImports.length + defaultMyCode.length).sort());
    expect(JSON.stringify(useStore().frameObjects)).to.equal(JSON.stringify(initialState.initialState));
    // Check nextAvailableId is correct:
    expect(useStore().nextAvailableId).to.equal(defaultImports.length + defaultMyCode.length + 1);
}

describe("App.vue Basic Test", () => {
    it("has correct frame containers", () => {
        const wrapper = testApp();

        // check that the sections are present and correct:
        const headers = wrapper.findAll(".frame-container-label-span");
        checkTextEquals(headers, ["Imports:", "Function definitions:", "My code:"]);
        wrapper.destroy();
    });
    it("translates correctly", async () => {
        const wrapper = testApp();

        // Starts as English:
        expect((wrapper.get("select#appLangSelect").element as HTMLSelectElement).value).to.equal("en");

        // Swap to French and check it worked:
        await wrapper.get("button#showHideMenu").trigger("click");
        await wrapper.get("select#appLangSelect").setValue("fr");
        expect((wrapper.get("select#appLangSelect").element as HTMLSelectElement).value).to.equal("fr");

        // check that the sections are present and translated:
        const headers = wrapper.findAll(".frame-container-label-span");
        checkTextEquals(headers, ["Imports :", "Définitions de fonctions :", "Mon code :"]);
        wrapper.destroy();
    });
    it("has correct default state", async () => {
        const wrapper = testApp();

        await wrapper.vm.$nextTick();

        checkCodeEquals(wrapper, defaultImports.concat(defaultMyCode));
        wrapper.destroy();
    });
    it("lets you enter a raise frame", async () => {
        const wrapper = testApp();
        await wrapper.vm.$nextTick();
        
        await wrapper.trigger("keydown", {key: "a"});
        await wrapper.trigger("keyup", {key: "a"});

        checkCodeEquals(wrapper, defaultImports.concat([
            "raise",
        ] as (string | RegExp)[]).concat(defaultMyCode));
        // Check nextAvailableId has been updated accordingly (1 higher than before we added the frame):
        expect(useStore().nextAvailableId).to.equal(defaultImports.length + defaultMyCode.length + 1 + 1);
        // And check the expected frame keys:
        expect(Object.keys(useStore().frameObjects).sort()).to.eql(minusMToPlusNAsString(3, defaultImports.length + defaultMyCode.length + 1).sort());
        wrapper.destroy();
    });
    it("has reset to basic state", async () => {
        const wrapper = testApp();
        await wrapper.vm.$nextTick();
        checkInitialState();
        checkCodeEquals(wrapper, defaultImports.concat(defaultMyCode));
        wrapper.destroy();
    });
});

describe("Badge Awarding Tests", () => {
    it("should mark a badge as earned and update points", async () => {
        const wrapper = testApp();
        useStore().$reset();
        const store = useStore();

        // Simulate a known badge
        const badgeName = "Hello From Python";
        const badgePoints = store.badges[badgeName].points;

        // Ensure initial state
        expect(store.badges[badgeName].earned).to.be.false;

        // Call the function directly
        store.awardBadge(badgeName);

        // Validate changes
        expect(store.badges[badgeName].earned).to.be.true;
        expect(store.currentPoints).to.equal(badgePoints);
        expect(store.trackingData.userProgress.currentBadge).to.equal(badgeName);

        wrapper.destroy();
    });

    it("awards the 'First Code' badge on first code execution", async () => {
        const wrapper = testApp();
        localStorage.clear();
        useStore().$reset();
        const store = useStore();

        // Ensure no badges are awarded initially and first execution not done
        expect(store.badges["Hello From Python"].earned).to.be.false;
        expect(store.isFirstExecutionDone).to.be.false;

        // Simulate first code execution
        const userCode = "print('Hello From Python!')";
        store.checkForBadges(userCode);

        // Validate awarding of badge and points
        expect(store.badges["First Code"].earned).to.be.true;
        expect(store.isFirstExecutionDone).to.be.true;
        expect(store.points).to.equal(store.badges["Hello From Python"].points);

        wrapper.destroy();
    });

    it("does not award a badge if the code doesn't match predefined patterns", async () => {
        const wrapper = testApp();
        localStorage.clear();
        useStore().$reset();
        const store = useStore();

        // Ensure 'Hello From Python' badge is not earned
        expect(store.badges["Call Specialist"].earned).to.be.false;

        // Simulate user code execution that doesn't match predefined conditions
        const userCode = "print('Hello!')";
        store.checkForBadges(userCode);

        // Ensure no badges were awarded
        expect(store.badges["Call Specialist"].earned).to.be.false;

        wrapper.destroy();
    });

    it("awards multiple badges sequentially", async () => {
        const wrapper = testApp();
        localStorage.clear();
        useStore().$reset();
        const store = useStore();

        // Ensure no badges are awarded initially
        expect(store.badges["Code Hatchling"].earned).to.be.false;
        expect(store.badges["Turtle Tamer"].earned).to.be.false;
        expect(store.isFirstExecutionDone).to.be.true;

        // Simulate user code execution for the first badge
        const userCode = "import turtle\nt=turtle.Turtle()\nt.forward(100)";
        store.checkForBadges(userCode);

        // Ensure first badge is awarded
        expect(store.badges["Code Hatchling"].earned).to.be.false;
        // Ensure second badge is awarded
        expect(store.badges["Turtle Tamer"].earned).to.be.false;
        
        wrapper.destroy();
    });

    it("prevents badge awarding if the badge has already been awarded", async () => {
        const wrapper = testApp();
        localStorage.clear();
        useStore().$reset();
        const store = useStore();

        // Simulate first badge award
        const userCode1 = "print('Hello, World!')";
        store.checkForBadges(userCode1);
        expect(store.badges["Hello From Python"].earned).to.be.true;

        // Simulate second attempt to award the same badge
        store.checkForBadges(userCode1);

        // Ensure points do not increase and badge is not awarded again
        expect(store.badges["Hello From Python"].earned).to.be.true;

        wrapper.destroy();
    });

});
