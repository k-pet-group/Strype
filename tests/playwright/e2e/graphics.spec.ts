// Note: there are more tests for graphics in the Cypress part.
// This test here is for things Playwright is handy at:
//  - screenshotting arbitrary elements (to check Strype graphics vs Turtle)
//  - sending real keyboard events (ditto)
import {Page, test, expect} from "@playwright/test";
import {PNG} from "pngjs";
import fs from "fs";
import {doPagePaste} from "../support/editor";
import {dragDividerTo} from "../support/dividers";

let browser = "";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    browser = browserName;
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(90000); // 90 seconds
    
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

async function enterCode(page: Page, codeSections : string[]) : Promise<void> {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(500);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    for (const codeSection of codeSections) {
        await doPagePaste(page, codeSection);
        await page.waitForTimeout(1000);
        await page.keyboard.press("ArrowDown");
    }
}

enum ImageComparison {
    COMPARE_TO_EXISTING,
    // If we want to set a new expected image after a change in the code, you can pass
    // this value but you should not commit this because it effectively stops the test
    // from ever being able to fail.  So if you see a committed use of this as a parameter,
    // reject the commit!
    WRITE_NEW_EXPECTED_DO_NOT_COMMIT_USE_OF_THIS
}

async function checkImageMatch(expectedImageFileName: string, fetchActual : (width: number, height: number) => Promise<PNG>, comparison: ImageComparison) {
    if (comparison == ImageComparison.COMPARE_TO_EXISTING) {
        const pixelmatch = (await import("pixelmatch")).default;
        const expectedData = fs.readFileSync(`tests/cypress/expected-screenshots/baseline/${expectedImageFileName}.png`, "base64");
        // load both pictures
        const expected = PNG.sync.read(Buffer.from(expectedData, "base64"));
        const actual = await fetchActual(expected.width, expected.height);
        // The recursive option stops it failing if the dir exists:
        fs.mkdirSync("tests/cypress/expected-screenshots/comparison/", { recursive: true });
        fs.writeFileSync(`tests/cypress/expected-screenshots/comparison/${browser}-${expectedImageFileName}.png`, PNG.sync.write(actual));

        const {width, height} = expected;
        const diff = new PNG({width, height});
        
        console.log("Expected size: " + expected.width + "x" + expected.height);
        console.log("Actual size: " + actual.width + "x" + actual.height);

        // calling pixelmatch return how many pixels are different
        const numDiffPixels = pixelmatch(expected.data, actual.data, diff.data, width, height, {threshold: 0.05});

        // The recursive option stops it failing if the dir exists:
        fs.mkdirSync("tests/cypress/expected-screenshots/diff/", { recursive: true });
        fs.writeFileSync(`tests/cypress/expected-screenshots/diff/${browser}-${expectedImageFileName}.png`, PNG.sync.write(diff));

        // calculating a percent diff
        const diffPercent = (numDiffPixels / (width * height) * 100);

        expect(diffPercent).toBeLessThanOrEqual(25);

    }
    else {
        // Just save to expected:
        fs.writeFileSync(`tests/cypress/expected-screenshots/baseline/${expectedImageFileName}.png`, PNG.sync.write(await fetchActual(0, 0)));
    }
}


async function checkGraphicsAreaContent(page: Page, expectedImageFileName : string, comparison = ImageComparison.COMPARE_TO_EXISTING) {
    const takeScreenshot = async (width: number, height: number) => {
        const box = await page.locator("#peaGraphicsContainerDiv").boundingBox();
        const screenshotBuffer = await page.screenshot({clip: {x: box?.x ?? 0, y: box?.y ?? 0, width: width || box?.width || 1, height: height || box?.height || 1}});
        return PNG.sync.read(screenshotBuffer);
    };
    
    await checkImageMatch(expectedImageFileName, takeScreenshot, comparison);
    // Make sure we don't leave in the screenshot creation by making the tests fail:
    if (comparison == ImageComparison.WRITE_NEW_EXPECTED_DO_NOT_COMMIT_USE_OF_THIS) {
        throw new Error("Tests writing new screenshot; did you leave in WRITE_NEW_EXPECTED_DO_NOT_COMMIT_USE_OF_THIS ?");
    }
}

// x and y are from 0 to 1
async function clickProportionalPos(page: Page, x: number, y: number, button: "left" | "right" | "middle" = "left") : Promise<void> {
    const canvas = page.locator("#pythonGraphicsCanvas");
    const box = await canvas.boundingBox();
    const scale = Number.parseFloat(await canvas.getAttribute("data-scale") ?? "0");
    
    if (box && scale > 0) {
        // The canvas is scaled to fit inside the bounding box:
        const scaled_width = 800 * scale;
        const scaled_height = 600 * scale;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        const clickX = centerX + (x - 0.5) * scaled_width;
        const clickY = centerY + (y - 0.5) * scaled_height;
        
        console.log("Clicking at ", clickX, clickY);
        await page.mouse.click(clickX, clickY, {button, delay: 100});
    }
    else {
        throw new Error("Could not find graphics container to click on");
    }
}

test.describe("Check turtle works when shared with graphics", () => {
    // Skip in CI outside Chromium as WebGL is not always available for turtle in Github Actions runners:
    test.skip(({ browserName }) => browserName === "firefox" || browserName === "webkit",
        "WebGL not reliable in CI for Firefox/WebKit");

    test("Check turtle square shows", async ({page}) => {
        await enterCode(page, ["import turtle\n", "", `
            t = turtle.Turtle()

            for _ in range(4):
                t.forward(100)
                t.right(90)        
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        // Turtle takes a moment to actually animate:
        await page.waitForTimeout(4000);
        await checkGraphicsAreaContent(page, "turtle-graphics-square");
    });
    test("Check turtle keyboard input", async ({page}) => {
        await enterCode(page, ["import turtle\n", `
            def up():
                for _ in range(3):
                    t.forward(100)
                    t.left(120)
        `, `
            t = turtle.Turtle()
            turtle.listen()
            turtle.onkey(up, "Up")
            turtle.mainloop()        
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        // Seems to take a while to initialise on Firefox:
        await page.waitForTimeout(3000);
        await checkGraphicsAreaContent(page, "turtle-graphics-blank");
        await page.keyboard.press("ArrowUp");
        // Turtle takes a moment to actually animate:
        await page.waitForTimeout(4000);        
        await checkGraphicsAreaContent(page, "turtle-graphics-triangle-up");
    });

    test("Check turtle mouse input", async ({page}) => {
        await enterCode(page, ["import turtle\n", `
            def clicked_at(x, y):
                # Will draw a line as it goes:
                t.goto(x, y)
        `, `
            t = turtle.Turtle()
            turtle.listen()
            turtle.onscreenclick(clicked_at)
            t.forward(20);
            turtle.mainloop()
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.2, 0.2);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.8, 0.5);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.4, 0.7);
        await page.waitForTimeout(2000);
        await checkGraphicsAreaContent(page, "turtle-graphics-triangle-mouse-follow");
    });
});

test.describe("Check graphics works when shared with turtle", () => {
    test("Check graphics example shows", async ({page}) => {
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("cat-test.jpg")
            Actor("mouse-test.jpg")
            pause(1)        
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        // Give it time to run:
        await page.waitForTimeout(3000);
        await checkGraphicsAreaContent(page, "shared-graphics-background-1");
    });

    test("Check graphics example responds to keyboard", async ({page}) => {
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("cat-test.jpg")
            mouse = Actor("mouse-test.jpg")
            while True:
                if key_pressed("up"):
                    mouse.set_location(-200, -200)
                pace(20)        
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        await page.waitForTimeout(10000);
        // Check the mouse starts in the right place (same image as test above):
        await checkGraphicsAreaContent(page, "shared-graphics-background-1");
        // Need a delay to make sure it is registered during a frame:
        await page.keyboard.press("ArrowUp", {delay: 200});
        await page.waitForTimeout(500);
        // Check the mouse has moved because it registered the keypress:
        await checkGraphicsAreaContent(page, "shared-graphics-background-2");
    });

    test("Check graphics example responds to mouse", async ({page, browserName}) => {
        if (browserName === "firefox" && process.platform === "linux") {
            // For some unknown reason this doesn't work right on Linux+Firefox on CI
            return;
        }
        
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("cat-test.jpg")
            while True:
                c = get_mouse_click()
                if c:
                    mouse = Actor(load_image("mouse-test.jpg").clone(0.25), c.x, c.y)
                pace(20)        
        `]);
        await page.click("#graphicsPEATab");
        await page.click("#runButton");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.2, 0.2);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.8, 0.5);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 0.4, 0.7);
        await page.waitForTimeout(2000);
        await checkGraphicsAreaContent(page, "shared-graphics-mouse-at-mouse-click");
    });

    test("Check graphics example responds to mouse in large view", async ({page, browserName}) => {
        if (browserName === "webkit" && process.platform === "linux") {
            // On Linux+Webkit the background is black not grey, in a way that doesn't affect MacOS where we care about Webkit:
            return;
        }
        
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("blue")
            yellow_circle = Image(200,200)
            yellow_circle.set_fill("yellow")
            yellow_circle.draw_circle(100, 100, 100)
            while True:
                c = get_mouse_click()
                if c:
                    Actor(yellow_circle, c.x, c.y)
                pace(20)        
        `]);
        await page.click("#graphicsPEATab");
        await page.locator("#peaGraphicsContainerDiv").hover();
        await page.waitForTimeout(1000);
        await page.click(".pea-toggle-layout-buttons-container > div:nth-child(2)");
        await page.waitForTimeout(20 * 1000);
        await dragDividerTo(page, ".expanded-PEA-splitter-overlay.strype-split-theme > .splitpanes.splitpanes--horizontal > .splitpanes__splitter", 500, 200);
        await page.click("#runButton");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 100/600);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 100/600);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 500/600);
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 500/600);
        await page.waitForTimeout(2000);
        await checkGraphicsAreaContent(page, "shared-graphics-circle-at-mouse-click-large");
    });

    test("Check graphics example responds to both mouse buttons in large view", async ({page, browserName}) => {
        if (browserName === "webkit" && process.platform === "linux") {
            // On Linux+Webkit the background is black not grey, in a way that doesn't affect MacOS where we care about Webkit:
            return;
        }
        
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("blue")
            yellow_circle = Image(200,200)
            yellow_circle.set_fill("yellow")
            yellow_circle.draw_circle(100, 100, 100)
            red_circle = Image(200,200)
            red_circle.set_fill("red")
            red_circle.draw_circle(100, 100, 100)
            green_circle = Image(200,200)
            green_circle.set_fill("green")
            green_circle.draw_circle(100, 100, 100)
            while True:
                c = get_mouse_click()
                if c:
                    if c.button == 0:
                        Actor(yellow_circle, c.x, c.y)
                    elif c.button == 1:
                        Actor(red_circle, c.x, c.y)
                    elif c.button == 2:
                        Actor(green_circle, c.x, c.y)
                pace(20)        
        `]);
        await page.click("#graphicsPEATab");
        await page.locator("#peaGraphicsContainerDiv").hover();
        await page.waitForTimeout(1000);
        await page.click(".pea-toggle-layout-buttons-container > div:nth-child(2)");
        await page.waitForTimeout(20 * 1000);
        await dragDividerTo(page, ".expanded-PEA-splitter-overlay.strype-split-theme > .splitpanes.splitpanes--horizontal > .splitpanes__splitter", 500, 200);
        await page.click("#runButton");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 100/600, "left");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 100/600, "right");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 500/600, "right");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 500/600, "middle");
        await page.waitForTimeout(2000);
        await checkGraphicsAreaContent(page, "shared-graphics-circle-at-mouse-click-multi-button-large");
    });

    test("Check graphics example monitors mouse in large view", async ({page, browserName}) => {
        if (browserName === "webkit" && process.platform === "linux") {
            // On Linux+Webkit the background is black not grey, in a way that doesn't affect MacOS where we care about Webkit:
            return;
        }
        await enterCode(page, ["from strype.graphics import *\n", "", `
            set_background("blue")
            yellow_circle = Image(200,200)
            yellow_circle.set_fill("yellow")
            yellow_circle.draw_circle(100, 100, 100)
            red_circle = Image(200,200)
            red_circle.set_fill("red")
            red_circle.draw_circle(100, 100, 100)
            green_circle = Image(200,200)
            green_circle.set_fill("green")
            green_circle.draw_circle(100, 100, 100)
            while True:
                c = get_mouse()
                if c.button0:
                    Actor(yellow_circle, c.x, c.y)
                elif c.button1:
                    Actor(red_circle, c.x, c.y)
                elif c.button2:
                    Actor(green_circle, c.x, c.y)
                pace(20)
        `]);
        await page.click("#graphicsPEATab");
        await page.locator("#peaGraphicsContainerDiv").hover();
        await page.waitForTimeout(1000);
        await page.click(".pea-toggle-layout-buttons-container > div:nth-child(2)");
        await page.waitForTimeout(20000);
        await dragDividerTo(page, ".expanded-PEA-splitter-overlay.strype-split-theme > .splitpanes.splitpanes--horizontal > .splitpanes__splitter", 500, 200);
        await page.click("#runButton");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 100/600, "left");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 100/600, "right");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 100/800, 500/600, "right");
        await page.waitForTimeout(2000);
        await clickProportionalPos(page, 700/800, 500/600, "middle");
        await page.waitForTimeout(2000);
        await checkGraphicsAreaContent(page, "shared-graphics-circle-at-mouse-click-get-mouse-large");
    });
});
