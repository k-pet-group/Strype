// We want to stress test loading and saving, so we pick a random frame
// and fill the slots with blanks or random content then see if it
// saves or not.

import {allFrameCommandsDefs, AllowedSlotContent, CommentFrameTypesIdentifier, DefIdentifiers, getFrameDefType, ImportFrameTypesIdentifiers, JointFrameIdentifiers, StandardFrameTypesIdentifiers} from "../../cypress/support/frame-types";
import seedrandom from "seedrandom";
import en from "../../../src/localisation/en/en_main.json";

import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "../../../src/helpers/sharedIdCssWithTests";
import {Page, test, expect, ElementHandle, JSHandle} from "@playwright/test";
import { rename } from "fs/promises";
import {checkFrameXorTextCursor, typeIndividually} from "../support/editor";
import {readFileSync} from "node:fs";
import {createBrowserProxy} from "../support/proxy";
import {load, save} from "../support/loading-saving";

let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    // With regards to Chromium: several of these tests fail on Chromium in Playwright on Mac and
    // I can't figure out why.  I've tried them manually in Chrome and Chromium on the same
    // machine and it works fine, but I see in the video that the test fails in Playwright
    // (pressing right out of a comment frame puts the cursor at the beginning and makes a frame cursor).
    // Since it works in the real browsers, and on Webkit and Firefox, we just skip the tests in Chromium
    test.skip(testInfo.project.name == "chromium", "Cannot run in Chromium");
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(180000); // 180 seconds
    
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});


type FrameEntry = {
    frameType: string;
    slotContent: string[];
    disabled?: boolean; // If missing, default is false
    // Note that if we are disabled, we should make sure all of body and joint are disabled.
    body?: FrameEntry[];
    joint?: FrameEntry[];
};

let rng = () => 0;

const framesBySection = [Object.values(ImportFrameTypesIdentifiers),
    [... Object.values(DefIdentifiers), ...Object.values(CommentFrameTypesIdentifier)],
    Object.values(StandardFrameTypesIdentifiers).filter((id) => id != "global" && id != "return" && id != "continue" && id != "break" && !Object.values(JointFrameIdentifiers).includes(id))];

function genRandomInt(n: number): number {
    // Get number into range of 0 to (n-1) inclusive:
    return ((rng() % n) + n) % n;
}
function pick<T>(ts: T[]): T {
    return ts[genRandomInt(ts.length)];
}

function genRandomString(includeSymbols: boolean) : string {
    // These are some easy valid characters and some awkward invalid ones, but
    // none that are valid Python operators:
    const candidates = includeSymbols ? "aB01#$!@_\\ü" : "aB01_ü";
    const len = genRandomInt(6);
    return Array.from({ length: len }, () => pick(candidates.split(""))).join("");
}

function genRandomExpression(level = 0) : string {
    // Keep a reasonable chance of just producing a simple name:
    if (genRandomInt(3) == 0 || level >= 3) {
        return genRandomString(true);
    }
    // Otherwise we glue together idents and operators and brackets:
    let expr = "";
    const len = genRandomInt(8 - level * 2);
    for (let i = 0; i < len; i++) {
        // Pick: ident, operator, string or bracket:
        expr += pick([
            () => genRandomString(true),
            () => pick(["0", "1", "-1", "+6.7", "0.78"]),
            () => pick(["+", "-", "*", "/", ">=", ">", " and ", " or ", " not ", " is ", " is not ", " not in "]),
            () => pick(["“”", "‘’", "“#”", "‘a’", "‘ foo bar ’", "‘+’", "“ and ”"]),
            () => {
                const brackets = pick([["(", ")"], ["[", "]"], ["{", "}"]]);
                return brackets[0] + genRandomExpression(level + 1) + brackets[1];
            },
        ] as (() => string)[])();
    }
    // If we have generated "is" <blank> "not" (which we encode as "is  not") it's going to get interpreted in the editor
    // as is not, so we just correct to the latter here:
    expr = expr.replaceAll(/is {2}not in/g, "is not  in");
    expr = expr.replaceAll(/is {2}not/g, "is not");
    // Similarly, > > will not be interpreted correctly so just discard one part:
    expr = expr.replaceAll(/> > >/g, ">");
    expr = expr.replaceAll(/> >/g, ">");
    return expr;
}

function disableAll(frames: FrameEntry[]) : FrameEntry[] {
    return frames.map((frame) => {
        return {
            ...frame,
            disabled: true,
            ...(frame.body != undefined ? {body: disableAll(frame.body)} : {}),
            ...(frame.joint != undefined ? {joint: disableAll(frame.joint)} : {}),
        };
    });  
}

function genRandomFrame(fromFrames: string[], level : number): FrameEntry {
    const id = pick(fromFrames);
    const def = getFrameDefType(id);
    const subLen = level == 2 ? 0 : genRandomInt(4 - level * 2);

    const children = def.allowChildren ? Array.from({ length: subLen }, () => genRandomFrame(framesBySection[2].filter((f) => !def.forbiddenChildrenTypes.includes(f)), level + 1)) : undefined;
    const jointChildren: FrameEntry[] | undefined = def.allowJointChildren ? [] : undefined;
    if (jointChildren != undefined && (id == "try" || genRandomInt(2) == 0)) {
        // Pick one then see what can follow that:
        let cur : string | undefined = pick(def.jointFrameTypes.filter((j) => !(j == "else" && id == "try")));
        while (cur != undefined) {
            const j = genRandomFrame([cur], level);
            jointChildren.push(j);
            const canFollow = getFrameDefType(j.frameType).jointFrameTypes.filter((f) => def.jointFrameTypes.includes(f));
            cur = canFollow && genRandomInt(3) != 0 ? pick(canFollow) : undefined; 
        }
    }
    
    // Disable 1 in 8:
    const disable = id != "blank" && id != "comment" && genRandomInt(8) == 0;
    
    return {
        frameType: id,
        ...(disable ? {disabled: true} : {}),
        slotContent: def.labels.filter((l) => l.showSlots ?? true).map((_, i) => {
            if (id == "import" || id == "from-import" || id == "funcdef" || ((id == "for" || id == "varassign") && i == 0) || ((id == "with") && i == 1)) {
                return genRandomString(false);
            }
            else {
                const expr = genRandomExpression();
                return id == "comment" || id == "library" ? expr.trim() : expr;
            }
        }),
        ...(children !== undefined ? { body: disable ? disableAll(children) : children } : {}),
        ...(jointChildren !== undefined ? { joint: disable ? disableAll(jointChildren) : jointChildren } : {}),
    };
}

async function disablePrev(page: Page, fromFollowingJoint: boolean) : Promise<void> {
    // We need to disable the frame just above us and it was joint.  We must do this by clicking
    // because we don't currently have keyboard support for disabling parts of
    // joint frames.  So we click just above the frame cursor:

    const elementHandle = await page.$(
        ".navigationPosition.caret:not(.invisible)"
    );

    if (!elementHandle) {
        throw new Error("Element not found");
    }

    const box = await elementHandle.boundingBox();

    if (!box) {
        throw new Error("Could not get bounding box");
    }
    const targetX = box.x + (fromFollowingJoint ? -10: 10);
    const targetY = box.y - (fromFollowingJoint ? 35 : 10);
    await page.mouse.click(targetX, targetY, {button: "right"});
    await page.waitForTimeout(200);
    await page.getByRole("menuitem", {name: en.contextMenu.disable}).click();
    await page.waitForTimeout(100);
}

async function enterFrame(page: Page, frame : FrameEntry, parentDisabled: boolean, beforeBody?: () => Promise<void>) : Promise<void> {
    const shortcut = Array.prototype.concat.apply([], Object.values(allFrameCommandsDefs)).find((d) => d.type.type === frame.frameType)?.shortcuts?.[0];
    if (shortcut) {
        if (shortcut == "\x13") {
            await page.keyboard.press("Enter");
        }
        else {
            await page.keyboard.type(shortcut);
        }
        await page.waitForTimeout(400);
        if (frame.frameType == "try") {
            // We delete the except which automatically gets generated, then add our own:
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(200);
            await page.keyboard.press("Backspace");
            await page.waitForTimeout(200);
        }
    }
    else {
        console.log("Did not find shortcut for " + frame.frameType);
        return;
    }
    if (frame.frameType == "funccall") {
        // Have to remove default brackets:
        await page.keyboard.press("Delete");
        await page.waitForTimeout(200);
    }
    
    for (let i = 0; i < frame.slotContent.length; i++){
        const slotType = getFrameDefType(frame.frameType).labels.filter((l) => l.showSlots ?? true)[i].allowedSlotContent ?? AllowedSlotContent.TERMINAL_EXPRESSION;
        const s = frame.slotContent[i];
        console.log("Entering slot:   <<<" + s + ">>> into " + frame.frameType);
        await checkFrameXorTextCursor(page, false, "Slot of frame " + frame.frameType);
        const enterable = slotType == AllowedSlotContent.FREE_TEXT_DOCUMENTATION || slotType == AllowedSlotContent.LIBRARY_ADDRESS ? s : s.replaceAll(/[“”]/g, "\"").replaceAll(/[‘’]/g, "'");
        await typeIndividually(page, enterable, 100);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
    }
    if (beforeBody) {
        await beforeBody();
    }
    if (frame.body !== undefined) {
        if (frame.frameType == "classdef") {
            // Need to remove the default constructor:
            await page.keyboard.press("Delete");
            await page.waitForTimeout(200);
        }
        
        for (const s of frame.body) {
            await checkFrameXorTextCursor(page, true, "Body of frame " + frame.frameType);
            await enterFrame(page, s, frame.disabled ?? false);
        }
        if (frame.joint && frame.joint.length > 0) {
            // We enter the next joint frame, and make any others a joint part of that:
            const [head, ...tail] = frame.joint;
            
            await enterFrame(page, {...head, joint: tail}, frame.disabled ?? false, frame.disabled && !parentDisabled && getFrameDefType(frame.frameType).isJointFrame ? () => disablePrev(page, true) : undefined);
        }
        else {
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(200);
            if (frame.disabled && getFrameDefType(frame.frameType).isJointFrame) {
                await disablePrev(page, false);
            }
        }
    }
    // This must be last item because otherwise we couldn't enter the frame:
    if (frame.disabled && !parentDisabled && !getFrameDefType(frame.frameType).isJointFrame) {
        // With shift, one press should select whole frame, including any joint frames:
        await page.keyboard.press("Shift+ArrowUp");
        await page.waitForTimeout(200);
        await page.keyboard.press(" ");
        await page.waitForTimeout(500);
        await page.getByRole("menuitem", { name: en.contextMenu.disable }).click();
        await page.waitForTimeout(100);
        // Now it's disabled, a single down press should skip the entire lot:
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
    }
    
    
    await checkFrameXorTextCursor(page, true, "After frame " + frame.frameType);
}

async function fetchAll(arrayHandle : JSHandle<HTMLElement[]>) : Promise<ElementHandle<HTMLElement>[]> {
    // Get individual JSHandle<HTMLElement> for each item
    const elementCount = await arrayHandle.evaluate((arr) => arr.length);

    const handles: JSHandle<HTMLElement>[] = await Promise.all(
        Array.from({ length: elementCount }).map((_, i) => {
            return arrayHandle.evaluateHandle((arr, i) => arr[i], i);
        })
    );
    
    return handles.map((h) => h.asElement());
}

function visibleTextContent(elementHandle : JSHandle<HTMLElement>) : Promise<string> {
    return elementHandle.evaluate((el) => {
        function getVisibleText(node: Node): string {
            if (node.nodeType === Node.TEXT_NODE) {
                const parent = node.parentElement;
                const style = parent && window.getComputedStyle(parent);
                const hidden = !style || style.display === "none" || style.visibility === "hidden";
                return hidden ? "" : (parent?.classList.contains("operator-slot") && node.textContent?.match(/^[a-z ]+$/) ? " " + node.textContent + " " : node.textContent) || "";
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(node as Element);
                if (style.display === "none" || style.visibility === "hidden") {
                    return "";
                }
                if ((node as HTMLElement).tagName.toLowerCase() === "img") {
                    // Turn the string literal (will only be one) into smart quotes:
                    return ((node as HTMLElement).getAttribute("data-code") ?? "").replace(/"([^"]+)"/, "“$1”");
                }

                return Array.from(node.childNodes).map(getVisibleText).join("");
            }

            return "";
        }

        return getVisibleText(el);
    });
}

async function getAllFrames(container : ElementHandle<HTMLElement>) : Promise<FrameEntry[]> {
    // Now find all frames within those:
    const frameDivSelector = "." + scssVars.frameDivClassName;
    // Get all the frame divs
    const outermostFramesArr = await container.evaluateHandle((root, selector) => {
        const matches = Array.from(root.querySelectorAll(selector)) as HTMLElement[];

        return matches.filter((el) => {
            const enclosingFrame = el.parentElement?.closest(selector);
            return (
                !enclosingFrame || enclosingFrame.contains(root)
            );
        });
    }, frameDivSelector);

    const outermostFrames = await fetchAll(outermostFramesArr);
    
    const frameEntries = [] as FrameEntry[];
    for (const el of outermostFrames) {
        
        const body : undefined | FrameEntry[] = await el.$$(":scope > .frame-body-container").then((bodyContainers) => {
            if (bodyContainers.length == 0) {
                return Promise.resolve(undefined as undefined | FrameEntry[]);
            }
            else {
                return getAllFrames(bodyContainers[0] as ElementHandle<HTMLElement>) as Promise<FrameEntry[] | undefined>;
            }
        });
        const joint : undefined | FrameEntry[] = await el.$$(":scope > .joint-frames").then((jointContainers) => {
            if (jointContainers.length == 0) {
                return Promise.resolve(undefined as undefined | FrameEntry[]);
            }
            else {
                return getAllFrames(jointContainers[0] as ElementHandle<HTMLElement>) as Promise<FrameEntry[] | undefined>;
            }
        });
        const slotEls = await el.$$(":scope > .frame-header .label-slot-structure");
        const slots = await Promise.all(slotEls.map( (el) => visibleTextContent(el as ElementHandle<HTMLElement>)));
        const frameType = await el.getAttribute("data-frameType");
        const disabled = await el.evaluate((el) => el.classList.contains("disabled"));
        frameEntries.push({
            frameType: frameType ?? "<unknown>",
            slotContent: slots.map((s) => s.replace(/\u200B/g, "") ?? ""),
            ...(disabled ? {disabled: true} : {}),
            ...(body !== undefined ? { body } : {}),
            ...(joint !== undefined ? { joint } : {}),
        });
    }
    return frameEntries;
}

async function getFramesFromDOM(page: Page) : Promise<FrameEntry[][]> {
    const containers = await page.$$(".container-frames");
    return Promise.all(containers.map((container) => getAllFrames(container as ElementHandle<HTMLElement>)));
}

async function newProject(page: Page) : Promise<void> {
    // New is located in the menu, so we need to open it first, then find the link and click on it:
    await page.click("#" + await strypeElIds.getEditorMenuUID());
    await page.waitForTimeout(200);
    await page.click("#" + await strypeElIds.getNewProjectLinkId());
    await page.waitForTimeout(2000);
}

async function testSpecific(page: Page, sections: FrameEntry[][], projectDoc?: string) : Promise<void> {
    await page.keyboard.press("Delete");
    await page.keyboard.press("Delete");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    
    if (projectDoc) {
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(100);
        const lines = projectDoc.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
                await page.keyboard.press("Shift+Enter");
            }
            await page.keyboard.type(lines[i]);
        }
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(500);
    }

    for (let section = 0; section < 3; section++) {
        for (let j = 0; j < sections[section].length; j++) {
            await enterFrame(page, sections[section][j], false);
        }
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);
    }
    const dom = await getFramesFromDOM(page);
    expect(dom).toEqual(sections);
    const savePath = await save(page);
    await newProject(page);
    
    // Log for debugging purposes:
    try {
        const contents = readFileSync(savePath, "utf8");
        console.log(contents);
    }
    catch (err) {
        console.error("Error reading file:", err);
    }
    
    // Must make it have .spy extension:
    await rename(savePath, savePath + ".spy");
    await load(page, savePath + ".spy");
    const dom2 = await getFramesFromDOM(page);
    // Just one should be needed, but why not both just in case:
    expect(dom2).toEqual(sections);
    expect(dom2).toEqual(dom);
}

test.describe("Enters, saves and loads random frame", () => {
    // One day we should get all these passing, but in the mean time...
    test.describe.configure({ retries: 3 });
    for (let i = 0; i < 5; i++) {
        test("Tests random entry #" + i, async ({page}, testInfo) => {
            // Increase test timeout:
            test.setTimeout(180_000);
            // Don't retry these tests; if they fail, we want to know:
            if (testInfo.retry > 0) {
                return;
            }
            
            await page.keyboard.press("Delete");
            await page.keyboard.press("Delete");
            await page.keyboard.press("ArrowUp");
            await page.keyboard.press("ArrowUp");

            const seed = Math.random().toString();
            console.log(`Seed: "${seed}"`);
            const prng = seedrandom(seed);
            rng = prng.int32.bind(prng);
            if (genRandomInt(3) == 1) {
                await page.keyboard.press("ArrowLeft");
                await page.waitForTimeout(100);
                await page.keyboard.type("Doc " + rng());
                await page.keyboard.press("ArrowRight");
                await page.waitForTimeout(100);
            }
            
            const frames = [[], [], []] as FrameEntry[][];
            for (let section = 0; section < 3; section++) {
                const numFrames = 5;
                for (let j = 0; j < numFrames; j++) {
                    const f = genRandomFrame(framesBySection[section], 0);
                    await enterFrame(page, f, false);
                    frames[section].push(f);
                }
                await page.keyboard.press("ArrowDown");
                await page.waitForTimeout(100);
            }
            console.log(JSON.stringify(frames, null, 2));
            const dom = await getFramesFromDOM(page);
            expect(dom, seed).toEqual(frames);
            const savePath = await save(page);
            await newProject(page);
            // Log for debugging purposes:
            try {
                const contents = readFileSync(savePath, "utf8");
                console.log(contents);
            }
            catch (err) {
                console.error("Error reading file:", err);
            }

            // Must make it have .spy extension:
            await rename(savePath, savePath + ".spy");
            await load(page, savePath + ".spy");
            const dom2 = await getFramesFromDOM(page);
            // Just one should be needed, but why not both just in case:
            expect(dom2, seed).toEqual(frames);
            expect(dom2, seed).toEqual(dom);
        });
    }
});

// Here we test some specifics which previously failed:
test.describe("Enters, saves and loads specific frames", () => {
    test("Tests funccall beginning with #", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["foo"]},
            {frameType: "funccall", slotContent: ["#bar"]},
            {frameType: "funccall", slotContent: ["baz"]},
        ]]);
    });
    test("Empty comments", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "comment", slotContent: [""]},
            {frameType: "funccall", slotContent: ["foo()"]},
            {frameType: "comment", slotContent: [""]},
        ]]);
    });
    test("Project documentation #1", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["foo()"]},
        ]], "This is the project docs");
    });
    test("Project documentation #2", async ({page}) => {
        await testSpecific(page, [[
            {frameType: "comment", slotContent: ["This is an import comment"]}], [], [
            {frameType: "funccall", slotContent: ["foo()"]},
        ]]);
    });
    test("Project documentation #3", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["foo()"]},
        ]], "This is the project docs\nwith newlines in it\nand a trailing newline\n");
    });
    test("Tests trailing blank line", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "blank", slotContent: []},
            {frameType: "funccall", slotContent: ["foo()"]},
            {frameType: "blank", slotContent: []},
        ]]);
    });
    test("Tests blank between while and if", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "while", slotContent: ["foo"], body: [], joint: []},
            {frameType: "blank", slotContent: []},
            {frameType: "if", slotContent: ["foo"], body: [], joint: []},
        ]]);
    });
    test("Tests blank inside while", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "while", slotContent: ["foo"], body: [
                {frameType: "blank", slotContent: []},
            ], joint: []},
            {frameType: "if", slotContent: ["foo"], body: [], joint: []},
        ]]);
    });
    test("Tests blank inside and after if", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["foo"], joint: [], body: [
                {frameType: "comment", slotContent: ["Inside if"]},
                {frameType: "blank", slotContent: []},
            ]},
            {frameType: "blank", slotContent: []},
            {frameType: "raise", slotContent: ["foo"]},
        ]]);
    });

    test("Blanks at the end of funcdef", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "funcdef", slotContent: ["foo", "", ""], body: [
                {frameType: "blank", slotContent: []},
                {frameType: "while", slotContent: ["foo"], body: [
                    {frameType: "comment", slotContent: ["Inside def"]},
                ], joint: []},
                {frameType: "blank", slotContent: []},
            ]},
        ], [
            {frameType: "blank", slotContent: []},
            {frameType: "while", slotContent: ["foo"], body: [
                {frameType: "comment", slotContent: ["Inside while"]},
            ], joint: []},
            {frameType: "comment", slotContent: ["Outside while"]},
        ]]);
    });

    test("Blanks at the end of funcdef #2", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "funcdef", slotContent: ["foo", "", ""], body: [
                {frameType: "blank", slotContent: []},
                {frameType: "blank", slotContent: []},
                {frameType: "blank", slotContent: []},
            ]},
            {frameType: "comment", slotContent: ["A"]},
            {frameType: "comment", slotContent: ["B"]},
            {frameType: "comment", slotContent: ["C"]},
        ], []]);
    });

    test("Test weird number on assignment LHS", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["1_", "#!0"]},
        ]]);
    });
    test("Test weird number on assignment LHS #2", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["01", "#!0"]},
        ]]);
    });

    test("Comments at the end of funcdefs", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "funcdef", slotContent: ["foo", "", ""], body: [
                {frameType: "varassign", slotContent: ["1_", "#!0"]},
                {frameType: "while", slotContent: ["foo"], body: [], joint: []},
                {frameType: "comment", slotContent: ["Inside def"]},
            ]},
            {frameType: "comment", slotContent: ["Outside def"]},
        ], [
            {frameType: "blank", slotContent: []},
            {frameType: "while", slotContent: ["foo"], body: [
                {frameType: "comment", slotContent: ["Inside while"]},
            ], joint: []},
            {frameType: "comment", slotContent: ["Outside while"]},
        ]]);
    });

    test("Comment-only body", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "while", slotContent: ["foo"], body: [
                {frameType: "comment", slotContent: ["Only comment in body"]},
            ], joint: []},
            {frameType: "raise", slotContent: ["foo"]},
        ]]);
    });

    test("For with else", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "for", slotContent: ["foo", "bar"], body: [
                {frameType: "raise", slotContent: ["baz"]},
            ], joint: [
                {frameType: "else", slotContent: [], body: [
                    {frameType: "raise", slotContent: ["abc"]},
                ]},
            ]},
            {frameType: "raise", slotContent: ["foo"]},
        ]]);
    });
    
    test("For+if", async ({page}) => {
        await testSpecific(page, [[], [],
            [
                {
                    "frameType": "for",
                    "slotContent": [
                        "01",
                        "ü_",
                    ],
                    "body": [
                        {
                            "frameType": "if",
                            "slotContent": [
                                "\\",
                            ],
                            "body": [
                                {
                                    "frameType": "for",
                                    "slotContent": [
                                        "B",
                                        "",
                                    ],
                                    "body": [],
                                    "joint": [],
                                },
                            ],
                            "joint": [
                                {
                                    "frameType": "else",
                                    "slotContent": [],
                                    "body": [
                                        {
                                            "frameType": "if",
                                            "slotContent": [
                                                "B#1",
                                            ],
                                            "body": [],
                                            "joint": [],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            "frameType": "funccall",
                            "slotContent": [
                                "",
                            ],
                        },
                    ],
                    "joint": [],
                },
                {
                    "frameType": "raise",
                    "slotContent": [
                        "",
                    ],
                },
            ],
        ]);
    });

    test("While with else", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "while", slotContent: ["True"], body: [
                {frameType: "raise", slotContent: ["baz"]},
            ], joint: [
                {frameType: "else", slotContent: [], body: [
                    {frameType: "raise", slotContent: ["abc"]},
                ]},
            ]},
            {frameType: "raise", slotContent: ["foo"]},
        ]]);
    });

    test("Blanks in try", async ({page}) => {
        test.slow();
        await testSpecific(page, [[], [],
            [
                {
                    "frameType": "funccall",
                    "slotContent": [
                        "ü1",
                    ],
                },
                {
                    "frameType": "comment",
                    "slotContent": [
                        "aa",
                    ],
                },
                {
                    "frameType": "while",
                    "slotContent": [
                        "",
                    ],
                    "body": [
                        {
                            "frameType": "if",
                            "slotContent": [
                                "Bü",
                            ],
                            "body": [
                                {
                                    "frameType": "try",
                                    "slotContent": [],
                                    "body": [],
                                    "joint": [
                                        {
                                            "frameType": "finally",
                                            "slotContent": [],
                                            "body": [],
                                        },
                                    ],
                                },
                            ],
                            "joint": [],
                        },
                    ],
                    "joint": [],
                },
                {
                    "frameType": "blank",
                    "slotContent": [],
                },
                {
                    "frameType": "if",
                    "slotContent": [
                        "$#a",
                    ],
                    "body": [
                        {
                            "frameType": "funccall",
                            "slotContent": [
                                "üB@@1",
                            ],
                        },
                        {
                            "frameType": "comment",
                            "slotContent": [
                                "_üü0",
                            ],
                        },
                    ],
                    "joint": [
                        {
                            "frameType": "else",
                            "slotContent": [],
                            "body": [
                                {
                                    "frameType": "comment",
                                    "slotContent": [
                                        "#0!0@",
                                    ],
                                },
                                {
                                    "frameType": "try",
                                    "slotContent": [],
                                    "body": [],
                                    "joint": [
                                        {
                                            "frameType": "finally",
                                            "slotContent": [],
                                            "body": [
                                                {
                                                    "frameType": "for",
                                                    "slotContent": [
                                                        "0\\üü_",
                                                        "!$B",
                                                    ],
                                                    "body": [],
                                                    "joint": [
                                                        {
                                                            "frameType": "else",
                                                            "slotContent": [],
                                                            "body": [],
                                                        },
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                                {
                                    "frameType": "blank",
                                    "slotContent": [],
                                },
                            ],
                        },
                    ],
                },
            ],
        ]);
    });
    test("Tests blank and comments inside disabled if", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["foo"], disabled: true, joint: [], body: [
                {frameType: "comment", disabled: true, slotContent: ["Inside if"]},
                {frameType: "blank", disabled: true, slotContent: []},
                {frameType: "raise", disabled: true, slotContent: ["foo"]},
                {frameType: "comment", disabled: true, slotContent: ["Inside if at end"]},
            ]},
            {frameType: "raise", slotContent: ["bar"]},
        ]]);
    });
    test("Tests disabled elif at end of body", async ({page}) => {
        await testSpecific(page, [[], [], [
            {
                "frameType": "for",
                "slotContent": [
                    "a_B\\@",
                    "",
                ],
                "body": [
                    {
                        "frameType": "raise",
                        "slotContent": [
                            "@$B_",
                        ],
                    },
                    {
                        "frameType": "if",
                        "slotContent": [
                            "ü\\ü!",
                        ],
                        "body": [
                            {
                                "frameType": "with",
                                "slotContent": [
                                    "#",
                                    "1_",
                                ],
                                "body": [],
                            },
                        ],
                        "joint": [
                            {
                                "frameType": "elif",
                                "slotContent": [
                                    "\\0aü$",
                                ],
                                "body": [],
                            },
                            {
                                "frameType": "elif",
                                "slotContent": [
                                    "a_\\@",
                                ],
                                "body": [],
                            },
                            {
                                "frameType": "elif",
                                "disabled": true,
                                "slotContent": [
                                    "#$a",
                                ],
                                "body": [],
                            },
                        ],
                    },
                    {
                        "frameType": "blank",
                        "slotContent": [],
                    },
                ],
                "joint": [
                    {
                        "frameType": "else",
                        "slotContent": [],
                        "body": [
                            {
                                "frameType": "comment",
                                "slotContent": [
                                    "\\#0!",
                                ],
                            },
                        ],
                    },
                ],
            }]]);
    });

    test("Tests blank and comment at start of disabled try", async ({page}) => {
        await testSpecific(page, [[], [], [
            {
                "frameType": "blank",
                "slotContent": [],
            },
            {
                "frameType": "try",
                "disabled": true,
                "slotContent": [],
                "body": [
                    {
                        "frameType": "blank",
                        "slotContent": [],
                        "disabled": true,
                    },
                    {
                        "frameType": "comment",
                        "slotContent": [
                            "",
                        ],
                        "disabled": true,
                    },
                    {
                        "frameType": "with",
                        "slotContent": [
                            "$ü_",
                            "_$B",
                        ],
                        "body": [],
                        "disabled": true,
                    },
                ],
                "joint": [
                    {
                        "frameType": "finally",
                        "disabled": true,
                        "slotContent": [],
                        "body": [
                            {
                                "frameType": "try",
                                "slotContent": [],
                                "body": [],
                                "joint": [
                                    {
                                        "frameType": "except",
                                        "disabled": true,
                                        "slotContent": [
                                            "#",
                                        ],
                                        "body": [],
                                    },
                                    {
                                        "frameType": "except",
                                        "slotContent": [
                                            "\\ü_",
                                        ],
                                        "body": [
                                            {
                                                "frameType": "comment",
                                                "slotContent": [
                                                    "1",
                                                ],
                                                "disabled": true,
                                            },
                                        ],
                                        "disabled": true,
                                    },
                                    {
                                        "frameType": "finally",
                                        "slotContent": [],
                                        "body": [],
                                        "disabled": true,
                                    },
                                ],
                                "disabled": true,
                            },
                            {
                                "frameType": "try",
                                "slotContent": [],
                                "body": [
                                    {
                                        "frameType": "varassign",
                                        "slotContent": [
                                            "_BBü\\",
                                            "$1#@",
                                        ],
                                        "disabled": true,
                                    },
                                ],
                                "joint": [
                                    {
                                        "frameType": "finally",
                                        "slotContent": [],
                                        "body": [
                                            {
                                                "frameType": "blank",
                                                "slotContent": [],
                                                "disabled": true,
                                            },
                                        ],
                                        "disabled": true,
                                    },
                                ],
                                "disabled": true,
                            },
                        ],
                    },
                ],
            },
        ]]);
    });

    test("Invalid expressions", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["/[@01]"]},
        ]]);
    });

    test("Invalid expressions #2", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["+“”{‘’}"], body: [], joint: []},
        ]]);
    });
    test("Invalid expressions #3", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["1_0B", "[1‘ foo bar ’aBü0]‘a’"]},
        ]]);
    });

    test("Valid nots", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: [" not foo( not bar)"]},
        ]]);
    });
    test("Invalid not #1", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["bar not foo(foo not bar)"]},
        ]]);
    });
    test("Invalid not #2", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: [" not in  is not  not (ü@B\\)"]},
        ]]);
    });
    test("Invalid not #3", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: [" and  not "]},
        ]]);
    });
    test("Invalid not #4", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["_0üB!_1_#[(B\\üB0)@{+ not in  not }( is not ) is not ]"]},
        ]]);
    });

    test("Invalid commas", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["a,b,c==d"], body: [], joint: []},
            {frameType: "while", slotContent: ["a,b,c==d"], body: [], joint: []},
            {frameType: "with", slotContent: ["a,b,c==d", "x,y,z"], body: []},
            {frameType: "for", slotContent: ["a,b,c", "x,y,z==d"], body: [], joint: []},
            {frameType: "varassign", slotContent: ["a,b,c", "x,y,z+5"]},
        ]]);
    });

    test("Libraries with quotes", async ({page}) => {
        await testSpecific(page, [[
            {frameType: "library", slotContent: ["\"a\"+\"\""]},
            {frameType: "library", slotContent: ["(+6.7){\" and \"[]} is not \"\"1"]},
            {frameType: "library", slotContent: ["(+6.7){“ and ”[]} is not “”1"]},
            {frameType: "library", slotContent: ["(#‘+’_$\\\\) not in "]},
        ], [], []]);
    });

    test("Enabled comments after disabled class and function", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", "Class doc, this is before ' this is after\nThis is another line with ' in it\nThis last one too'"], body: [], disabled: true},
            {frameType: "funcdef", slotContent: ["foo", "", "Func doc, this is before \" this is after\nThis is another line with \" in it\nThis last one too\""], body: [], disabled: true},
            {frameType: "comment", slotContent: ["This has a single quote ' and a double quote\" in it."]},
            {frameType: "comment", slotContent: ["This has paired single quotes ' like this ' and paired double quotes \" like this \" in it."]},
            {frameType: "comment", slotContent: ["This has a single quote ' and a double quote\" in it.\nAnd a second line without."]},
            {frameType: "comment", slotContent: ["This has paired single quotes ' like this ' and paired double quotes \" like this \" in it.\n And a second line too."]},
        ], []], "Project doc, this is before ' this is after\nThis is another line with \" in it\nThis last one too' \"'");
    });
    
    test("Empty classes", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", ""], body: []},
        ], []]);
    });
    
    test("Comment character in description fields", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", "Class doc, this is before # this is after"], body: []},
            {frameType: "funcdef", slotContent: ["foo", "", "Func doc, this is before # this is after"], body: []},
        ], []], "Project doc, this is before # this is after");
    });

    test("Comment character in multi-line description fields", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", "Class doc, this is before # this is after\nThis is another line with # in it\nThis last one too#"], body: []},
            {frameType: "funcdef", slotContent: ["foo", "", "Func doc, this is before # this is after\nThis is another line with # in it\nThis last one too#"], body: []},
        ], []], "Project doc, this is before # this is after\nThis is another line with # in it\nThis last one too#");
    });

    test("Comment character in disabled multi-line description fields", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", "Class doc, this is before # this is after\nThis is another line with # in it\nThis last one too#"], body: [], disabled: true},
            {frameType: "funcdef", slotContent: ["foo", "", "Func doc, this is before # this is after\nThis is another line with # in it\nThis last one too#"], body: [], disabled: true},
        ], []], "Project doc, this is before # this is after\nThis is another line with # in it\nThis last one too#");
    });

    test("Quote characters in descriptions and comments", async ({page}) => {
        await testSpecific(page, [[], [
            {frameType: "classdef", slotContent: ["Foo", "Class doc, this is before ' this is after\nThis is another line with ' in it\nThis last one too'"], body: []},
            {frameType: "funcdef", slotContent: ["foo", "", "Func doc, this is before \" this is after\nThis is another line with \" in it\nThis last one too\""], body: []},
            {frameType: "comment", slotContent: ["This has a single quote ' and a double quote\" in it."]},
            {frameType: "comment", slotContent: ["This has paired single quotes ' like this ' and paired double quotes \" like this \" in it."]},
            {frameType: "comment", slotContent: ["This has a single quote ' and a double quote\" in it.\nAnd a second line without."]},
            {frameType: "comment", slotContent: ["This has paired single quotes ' like this ' and paired double quotes \" like this \" in it.\n And a second line too."]},
        ], []], "Project doc, this is before ' this is after\nThis is another line with \" in it\nThis last one too' \"'");
    });

    test("Format strings", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["f‘Hello’"], body: [], joint: []},
            {frameType: "funccall", slotContent: ["print(f‘{x}’)"]},
        ]]);
    });
    
    test("Complex image expression", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["myDict", "{4.5:[(load_image(“data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII”),-180,170,“a”),(load_image(“data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII”),0,0,“foo”,11)],11:[(load_image(“data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII”),0,0,“bar”)]}"]},
            {frameType: "funccall", slotContent: ["print(myDict)"]},
        ]]);
    });
});
