import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { doPagePaste, enterCode, pressFrameShortcut } from "../support/editor";
import { setupStrypeTest } from "../support/general";
import { save } from "../support/loading-saving";
import { createBlackPngBase64 } from "../support/media";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Saves the project and returns the lines of code in the Imports section
// (only the first save in a test shows the save dialog, so we track whether we've saved yet)
const hasSaved = new WeakSet<Page>();
async function getImportLines(page: Page) : Promise<string[]> {
    const content = readFileSync(await save(page, !hasSaved.has(page)), "utf-8");
    hasSaved.add(page);
    const imports = /#\(=> Section:Imports\n([\s\S]*?)#\(=> Section:Definitions/.exec(content)?.[1] ?? "";
    return imports.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

const GRAPHICS_IMPORT = "from strype.graphics import *";
const SOUND_IMPORT = "from strype.sound import *";
const SOUND_LITERAL = "load_sound(\"data:audio/wav;base64,UklGRgAAAABXQVZF\")";

// Image and sound literals only work if load_image/load_sound have been imported, so inserting
// one should add the necessary import if it is missing.
test.describe("Imports for media literals", () => {
    test("Pasting an image at the frame cursor adds the graphics import if missing", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        expect(await getImportLines(page)).toEqual([]);
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        expect(await getImportLines(page)).toEqual([GRAPHICS_IMPORT]);
    });

    test("Pasting an image at the text cursor adds the graphics import if missing", async ({page}) => {
        await enterCode(page, [SOUND_IMPORT, "", ""]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        // The existing import is kept and the new one goes after it:
        expect(await getImportLines(page)).toEqual([SOUND_IMPORT, GRAPHICS_IMPORT]);
    });

    test("Does not add an import which is already there", async ({page}) => {
        // The default project has both imports already:
        const before = await getImportLines(page);
        expect(before).toEqual([GRAPHICS_IMPORT, SOUND_IMPORT]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        expect(await getImportLines(page)).toEqual(before);
    });

    test("Importing load_image by name is enough", async ({page}) => {
        await enterCode(page, ["from strype.graphics import load_image", "", ""]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        expect(await getImportLines(page)).toEqual(["from strype.graphics import load_image"]);
    });

    test("Importing the module or an alias is not enough", async ({page}) => {
        await enterCode(page, ["import strype.graphics\nfrom strype.graphics import load_image as li", "", ""]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        expect(await getImportLines(page)).toEqual(["import strype.graphics", "from strype.graphics import load_image as li", GRAPHICS_IMPORT]);
    });

    test("Pasting code with a sound literal adds the sound import only", async ({page}) => {
        await enterCode(page, [GRAPHICS_IMPORT, "", ""]);
        await doPagePaste(page, "x = " + SOUND_LITERAL);
        expect(await getImportLines(page)).toEqual([GRAPHICS_IMPORT, SOUND_IMPORT]);
    });

    test("Pasting a sound literal into a slot adds the sound import", async ({page}) => {
        await enterCode(page, [GRAPHICS_IMPORT, "", ""]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, SOUND_LITERAL);
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        expect(await getImportLines(page)).toEqual([GRAPHICS_IMPORT, SOUND_IMPORT]);
    });

    test("Pasting code without media literals does not add imports", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        await doPagePaste(page, "x = 1");
        expect(await getImportLines(page)).toEqual([]);
    });

    test("Undo after pasting an image at the frame cursor also removes the added import", async ({page}) => {
        await enterCode(page, ["", "", ""]);
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        await page.keyboard.press("ControlOrMeta+Z");
        await expect(page.locator("img.label-slot-media")).toHaveCount(0);
        expect(await getImportLines(page)).toEqual([]);
    });

    test("Undo after pasting an image at the text cursor still removes the image", async ({page}) => {
        // The undo step for typing/pasting in a slot only covers that frame, so the import (which is
        // in a different frame) is deliberately left behind -- but undo must still work for the image:
        await enterCode(page, ["", "", ""]);
        await pressFrameShortcut(page, "p");
        await doPagePaste(page, createBlackPngBase64(20, 20), "image/png");
        await expect(page.locator("img.label-slot-media")).toHaveCount(1);
        await page.keyboard.press("ControlOrMeta+Z");
        await expect(page.locator("img.label-slot-media")).toHaveCount(0);
    });
});
