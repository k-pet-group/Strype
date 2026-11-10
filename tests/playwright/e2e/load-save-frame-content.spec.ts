// We want to stress test loading and saving, so we enter a set of specific
// frames and fill the slots with blanks or specific content then see if it
// saves or not.

import {allFrameCommandsDefs, AllowedSlotContent, getFrameDefType} from "../../cypress/support/frame-types";
import en from "../../../src/localisation/en/en_main.json";

import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "../../../src/helpers/sharedIdCssWithTests";
import {Page, test, expect, ElementHandle, JSHandle} from "@playwright/test";
import { rename } from "fs/promises";
import {checkFrameXorTextCursor, clearDefaultProject, pressFrameShortcut, typeIndividually, waitForEditorSettled} from "../support/editor";
import {readFileSync} from "node:fs";
import {createBrowserProxy} from "../support/proxy";
import {load, save} from "../support/loading-saving";
import { DEFAULT_STARTING_FRAME_COUNT, setupStrypeTest } from "../support/general";

let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 240000, skipPyodide: true});
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
});


type FrameEntry = {
    frameType: string;
    slotContent: string[];
    // What to actually type for each slot, if different from slotContent -- used only when the
    // very first character typed into a brand new, never-yet-touched slot is itself a space (e.g.
    // slotContent starting with a stray leading space, testing that it's silently discarded): with
    // nothing typed anywhere yet, there's nothing for the slot-shortcuts-pane delay to measure
    // against (see isSlotShortcutsPaneSpaceDueToDelay()/LabelSlotsStructure.vue's forwardKeyEvent),
    // so that first space is indistinguishable from deliberately opening the pane and needs to be
    // typed some other way. Once a slot already has other content, a space typed shortly afterwards
    // (e.g. after a keyword/operator split) is naturally exempted by the delay and doesn't need this.
    typedSlotContent?: string[];
    disabled?: boolean; // If missing, default is false
    // Note that if we are disabled, we should make sure all of body and joint are disabled.
    body?: FrameEntry[];
    joint?: FrameEntry[];
};

async function dismissAutocompleteIfShowing(page: Page) : Promise<void> {
    // The randomly-generated slot content often looks like an identifier, which can trigger the
    // autocomplete dropdown (AutoCompletion.vue). While it's open, ArrowUp/ArrowDown are consumed
    // by LabelSlot.vue's handleUpDown to navigate the dropdown instead of the editor (see its
    // "showAC" check), which can leave later frame/body navigation acting on the wrong target --
    // this is a likely cause of the "expected a frame cursor, found none" flakiness in this file.
    // Escape closes the dropdown while staying in the slot, but pressing it when the dropdown
    // ISN'T showing exits/blurs the slot entirely (see LabelSlot.vue's onEscKeyUp), which would be
    // its own new source of unexpected cursor movement -- so we only press it when the dropdown is
    // actually visible:
    if (await page.locator(`.${scssVars.acPopupContainerClassName}:visible`).count() > 0) {
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);
    }
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
    // No manual wait needed for the context menu to render -- click() below already waits for
    // the menu item to become actionable:
    await page.getByRole("menuitem", {name: en.contextMenu.disable}).click();
    await waitForEditorSettled(page);
}

async function enterFrame(page: Page, frame : FrameEntry, parentDisabled: boolean, beforeBody?: () => Promise<void>) : Promise<void> {
    const shortcut = Array.prototype.concat.apply([], Object.values(allFrameCommandsDefs)).find((d) => d.type.type === frame.frameType)?.shortcuts?.[0];
    if (shortcut) {
        if (shortcut == "\x13") {
            await page.keyboard.press("Enter");
        }
        else {
            await pressFrameShortcut(page, shortcut);
        }
        await waitForEditorSettled(page);
        if (frame.frameType == "try") {
            // We delete the except which automatically gets generated, then add our own:
            await page.keyboard.press("ArrowDown");
            await waitForEditorSettled(page);
            await page.keyboard.press("Backspace");
            await waitForEditorSettled(page);
        }
    }
    else {
        console.log("Did not find shortcut for " + frame.frameType);
        return;
    }
    if (frame.frameType == "funccall") {
        // Have to remove default brackets:
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
    }

    for (let i = 0; i < frame.slotContent.length; i++){
        const slotType = getFrameDefType(frame.frameType).labels.filter((l) => l.showSlots ?? true)[i].allowedSlotContent ?? AllowedSlotContent.TERMINAL_EXPRESSION;
        const s = frame.typedSlotContent?.[i] ?? frame.slotContent[i];
        console.log("Entering slot:   <<<" + s + ">>> into " + frame.frameType);
        await checkFrameXorTextCursor(page, false, "Slot of frame " + frame.frameType);
        const enterable = slotType == AllowedSlotContent.FREE_TEXT_DOCUMENTATION || slotType == AllowedSlotContent.LIBRARY_ADDRESS ? s : s.replaceAll(/[“”]/g, "\"").replaceAll(/[‘’]/g, "'");
        await typeIndividually(page, enterable);
        await dismissAutocompleteIfShowing(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
    }
    if (beforeBody) {
        await beforeBody();
    }
    if (frame.body !== undefined) {
        if (frame.frameType == "classdef") {
            // Need to remove the default constructor:
            await page.keyboard.press("Delete");
            await waitForEditorSettled(page);
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
            await waitForEditorSettled(page);
            if (frame.disabled && getFrameDefType(frame.frameType).isJointFrame) {
                await disablePrev(page, false);
            }
        }
    }
    // This must be last item because otherwise we couldn't enter the frame:
    if (frame.disabled && !parentDisabled && !getFrameDefType(frame.frameType).isJointFrame) {
        // With shift, one press should select whole frame, including any joint frames:
        await page.keyboard.press("Shift+ArrowUp");
        await waitForEditorSettled(page);
        // Enter opens the frame context menu with a selection active; Space is now the frame-commands
        // pane prefix instead (see App.vue/Commands.vue), so it no longer does this:
        await page.keyboard.press("Enter");
        // No manual wait needed for the context menu to render -- click() below already waits for
        // the menu item to become actionable:
        await page.getByRole("menuitem", { name: en.contextMenu.disable }).click();
        await waitForEditorSettled(page);
        // Now it's disabled, a single down press should skip the entire lot:
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
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
    // Confirming "new project" triggers a full page reload (see resetStrypeProject in App.vue) --
    // wait for the reloaded app to actually be ready, using the same signal beforeEach uses for
    // the initial page load, rather than guessing how long the reload takes. noWaitAfter avoids a
    // hang: the click handler synchronously unmounts this link (showMenu=false) right after
    // scheduling the reload, which otherwise races Playwright's own post-click wait:
    await page.click("#" + await strypeElIds.getNewProjectLinkId(), {noWaitAfter: true});
    // A full page reload is genuinely slower than the default 5s assertion timeout under load
    // (same reasoning as the equivalent check in loading-saving.ts's load()):
    await expect(page.locator(".frame-div")).toHaveCount(DEFAULT_STARTING_FRAME_COUNT, {timeout: 20000});
}

// typedSlotContent only steers what's typed (see FrameEntry) -- it's not part of the resulting DOM
// shape, so it must be stripped before comparing against getFramesFromDOM()'s output.
function stripTypedSlotContent(entries: FrameEntry[]): FrameEntry[] {
    return entries.map((entry) => {
        const rest = {...entry};
        delete rest.typedSlotContent;
        return {
            ...rest,
            ...(entry.body !== undefined ? {body: stripTypedSlotContent(entry.body)} : {}),
            ...(entry.joint !== undefined ? {joint: stripTypedSlotContent(entry.joint)} : {}),
        };
    });
}

async function testSpecific(page: Page, sections: FrameEntry[][], projectDoc?: string) : Promise<void> {
    // The editor has a fourth container after Imports, Definitions and Main: the Testing section. These tests
    // don't use it (clearDefaultProject() empties it, and an empty one isn't saved), so it is always empty:
    const expectedSections = [...sections.map(stripTypedSlotContent), []];
    // Clears every default frame (Imports and Main), leaving the caret at the top of Imports --
    // exactly where the section-by-section loop below needs to start:
    await clearDefaultProject(page);

    if (projectDoc) {
        await page.keyboard.press("ArrowLeft");
        await waitForEditorSettled(page);
        const lines = projectDoc.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (i > 0) {
                await page.keyboard.press("Shift+Enter");
            }
            await page.keyboard.type(lines[i]);
        }
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
    }

    for (let section = 0; section < 3; section++) {
        for (let j = 0; j < sections[section].length; j++) {
            await enterFrame(page, sections[section][j], false);
        }
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
    }
    const dom = await getFramesFromDOM(page);
    expect(dom).toEqual(expectedSections);
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
    expect(dom2).toEqual(expectedSections);
    expect(dom2).toEqual(dom);
}

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

    // Regression test for the multi-level-nesting case of the blank-before-joint-continuation bug
    // fixed alongside https://github.com/k-pet-group/Strype/issues/757 : the blank line here sits
    // one level shallower than the enclosing if/elif chain's own body, but two levels deeper than
    // the "else" that follows -- it belongs at the "for" body's own indent (matching "if"), not at
    // either adjacent line's indent (the elif body's, nor the outer else's).
    test("Tests blank line before an outer else, nested inside an if/elif chain", async ({page}) => {
        await testSpecific(page, [[], [], [
            {
                "frameType": "for",
                "slotContent": ["i", "myList"],
                "body": [
                    {
                        "frameType": "if",
                        "slotContent": ["a"],
                        "body": [{"frameType": "raise", "slotContent": ["b"]}],
                        "joint": [
                            {"frameType": "elif", "slotContent": ["c"], "body": [{"frameType": "raise", "slotContent": ["d"]}]},
                        ],
                    },
                    {"frameType": "blank", "slotContent": []},
                ],
                "joint": [
                    {"frameType": "else", "slotContent": [], "body": [{"frameType": "raise", "slotContent": ["e"]}]},
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
        // The leading space is the very first character typed into a brand new slot -- with nothing
        // typed anywhere yet, the slot-shortcuts-pane delay (isSlotShortcutsPaneSpaceDueToDelay) has
        // nothing to measure against, so that space is indistinguishable from deliberately opening
        // the pane. Type the space-free form instead: "not" is still recognised as a keyword
        // operator at the very start of a slot either way (LabelSlot.vue's processInput matches on
        // potentialOutput.startsWith(textualOperator + " ")), and ends up surrounded by spaces in
        // the canonical content regardless of whether one was typed.
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: [" not foo( not bar)"], typedSlotContent: ["not foo(not bar)"]},
        ]]);
    });
    test("Valid lambda", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["foo( lambda x:x)"]},
        ]]);
    });
    test("Valid not after binary operator", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "if", slotContent: ["foo==0 and  not bar"], body: [], joint: []},
        ]]);
    });
    test("Valid unary minus", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["x", "foo(-bar,-baz)"]},
        ]]);
    });
    test("Invalid not #1", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: ["bar not foo(foo not bar)"]},
        ]]);
    });
    test("Invalid not #3", async ({page}) => {
        // See "Valid nots" above -- the leading space is the very first character typed here too.
        await testSpecific(page, [[], [], [
            {frameType: "funccall", slotContent: [" and  not "], typedSlotContent: ["and  not "]},
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
    
    test("Slice operators", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["a[1:5]", "b[:6]"]},
            {frameType: "varassign", slotContent: ["c[2:]", "d[:]"]},
            {frameType: "varassign", slotContent: ["e[::9]", "f[4:10:3]"]},
            {frameType: "varassign", slotContent: ["g[::-1]", "h[:7:]"]},
            {frameType: "varassign", slotContent: ["i[::]", "j[8::]"]},
        ]]);
    });

    test("Advanced keyword operators", async ({page}) => {
        await testSpecific(page, [[], [], [
            {frameType: "varassign", slotContent: ["expr_alpha", "value_alpha if cond_alpha else alt_alpha"]},
            {frameType: "varassign", slotContent: ["expr_beta", "(x_beta if cond_beta else y_beta) if outer_beta else z_beta"]},
            {frameType: "varassign", slotContent: ["expr_gamma", "[g_gamma for g_gamma in seq_gamma]"]},
            {frameType: "varassign", slotContent: ["expr_delta", "[d_delta for d_delta in seq_delta if d_delta>0]"]},
            {frameType: "varassign", slotContent: ["expr_epsilon", "{e_epsilon for e_epsilon in seq_epsilon if e_epsilon%2==0}"]},
            {frameType: "varassign", slotContent: ["expr_zeta", "{k_zeta:v_zeta for (k_zeta,v_zeta) in pairs_zeta}"]},
            {frameType: "varassign", slotContent: ["expr_eta", "tuple(h_eta for h_eta in seq_eta)"]},
            {frameType: "varassign", slotContent: ["expr_theta", "sum(t_theta for t_theta in seq_theta if t_theta<10)"]},
            {frameType: "varassign", slotContent: ["expr_iota", "[i_iota async for i_iota in aseq_iota]"]},
            {frameType: "varassign", slotContent: ["expr_kappa", "await coro_kappa()"]},
        ]]);
    });
});
