import { test, expect, Page } from "@playwright/test";
import en from "../../../src/localisation/en/en_main.json";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// The four layout buttons (tabs collapsed/expanded, split collapsed/expanded) only appear when the
// PEA's content is hovered:
async function chooseLayout(page: Page, nthButton: number): Promise<void> {
    await page.locator("#peaTabContentContainerDiv").hover();
    await page.click(`.pea-toggle-layout-buttons-container > div:nth-child(${nthButton})`);
}

test.describe("Python execution area tab headers", () => {
    test("tabs layout has separate Graphics, Console and Files headers", async ({ page }) => {
        await expect(page.locator("#graphicsPEATab")).toBeVisible();
        await expect(page.locator("#consolePEATab")).toBeVisible();
        await expect(page.locator("#consolePEATab")).toContainText(en.PEA.console);
        await expect(page.locator("#filesPEATab")).toBeVisible();
        await expect(page.locator("#consolePEATab .pea-turtle-img")).toHaveCount(0);
    });

    for (const [name, nthButton] of [["split collapsed", 3], ["split expanded", 4]] as const) {
        test(`${name} layout merges Graphics and Console into one Output header`, async ({ page }) => {
            await chooseLayout(page, nthButton);
            await expect(page.locator("#graphicsPEATab")).toBeHidden();
            const output = page.locator("#consolePEATab");
            await expect(output).toBeVisible();
            await expect(output).toContainText(en.PEA.output);
            await expect(output).not.toContainText(en.PEA.console);
            // Both icons: the turtle image, then the console glyph:
            await expect(output.locator(".pea-turtle-img")).toBeVisible();
            await expect(output).toContainText("❱⎽");
            await expect(page.locator("#filesPEATab")).toBeVisible();
            // Output is the selected header, and the console and graphics areas are showing together:
            await expect(output).toHaveClass(/active/);
            await expect(page.locator("#peaConsole")).toBeVisible();
            await expect(page.locator("#peaGraphicsContainerDiv")).toBeVisible();

            // Files replaces both, and Output brings both back:
            await page.click("#filesPEATab");
            await expect(page.locator("#filesPEATab")).toHaveClass(/active/);
            await expect(page.locator(".file-system-pane")).toBeVisible();
            await expect(page.locator("#peaConsole")).toBeHidden();
            await page.click("#consolePEATab");
            await expect(output).toHaveClass(/active/);
            await expect(page.locator("#peaConsole")).toBeVisible();
            await expect(page.locator("#peaGraphicsContainerDiv")).toBeVisible();
        });
    }

    test("going from the Graphics tab to a split layout leaves Output selected", async ({ page }) => {
        await page.click("#graphicsPEATab");
        await expect(page.locator("#graphicsPEATab")).toHaveClass(/active/);
        await chooseLayout(page, 3);
        await expect(page.locator("#consolePEATab")).toHaveClass(/active/);
    });

    test("tab headers drop their labels, keeping the icons, rather than wrapping when narrow", async ({ page }) => {
        const tabs = ["#graphicsPEATab", "#consolePEATab", "#filesPEATab"];
        // All with their labels when there's plenty of room:
        await page.setViewportSize({width: 1600, height: 900});
        await expect(page.locator("#filesPEATab .pea-tab-label")).toBeVisible();

        // Narrow enough that the full headers would not fit on one line:
        await page.setViewportSize({width: 900, height: 900});
        await expect(page.locator("#filesPEATab .pea-tab-label")).toBeHidden();
        await expect(page.locator("#consolePEATab .pea-tab-label")).toBeHidden();
        const tops = await Promise.all(tabs.map((t) => page.locator(t).evaluate((el) => el.getBoundingClientRect().top)));
        expect(new Set(tops.map(Math.round)).size).toBe(1);
        // The name is still available:
        await expect(page.locator("#filesPEATab")).toHaveAttribute("title", en.PEA.fileSystem);

        // And the labels come back when there's room again:
        await page.setViewportSize({width: 1600, height: 900});
        await expect(page.locator("#filesPEATab .pea-tab-label")).toBeVisible();
    });

    test("tab headers never show wrapped, even for one frame, when becoming narrow", async ({ page }) => {
        await page.setViewportSize({width: 1600, height: 900});
        await expect(page.locator("#filesPEATab .pea-tab-label")).toBeVisible();
        // Record, on every frame, whether the headers are on more than one line:
        await page.evaluate(() => {
            const w = window as any;
            w.wrappedFrames = 0;
            w.sampling = true;
            const sample = () => {
                const tops = ["graphicsPEATab", "consolePEATab", "filesPEATab"].map((id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? -1));
                if (new Set(tops).size > 1) {
                    w.wrappedFrames++;
                }
                if (w.sampling) {
                    next();
                }
            };
            // requestAnimationFrame callbacks run before the frame's layout and resize observers, so sample
            // after that frame has been painted instead (what the user has actually seen):
            const next = () => requestAnimationFrame(() => setTimeout(sample, 0));
            next();
        });
        for (let width = 1500; width >= 900; width -= 50) {
            await page.setViewportSize({width, height: 900});
        }
        await expect(page.locator("#filesPEATab .pea-tab-label")).toBeHidden();
        await page.evaluate(() => (window as any).sampling = false);
        expect(await page.evaluate(() => (window as any).wrappedFrames)).toBe(0);
    });

    test("the icon and label of a tab header have a gap between them", async ({ page }) => {
        await page.setViewportSize({width: 1600, height: 900});
        await expect(page.locator("#graphicsPEATab .pea-tab-label")).toBeVisible();
        const gap = await page.locator("#graphicsPEATab").evaluate((el) => {
            const img = el.querySelector("img")?.getBoundingClientRect();
            const label = el.querySelector(".pea-tab-label")?.getBoundingClientRect();
            return (label?.left ?? 0) - (img?.right ?? 0);
        });
        expect(gap).toBeGreaterThan(2);
    });
});
