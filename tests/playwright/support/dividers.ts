import {Page, expect} from "@playwright/test";

export async function dragDividerTo(page: Page, locator: string, x: number, y: number): Promise<void> {
    const splitter = page.locator(locator);
    const box = await getSplitterPos(page, locator);

    const currentX = box.x + box.width / 2;
    const currentY = box.y + box.height / 2;

    await page.mouse.move(currentX, currentY);
    await page.mouse.down();
    await page.mouse.move(x, y, {steps: 1});
    // For a normally-sized splitter, splitpanes updates pane sizes synchronously on mousemove, so
    // its bounding box reflects the move almost immediately -- wait for that rather than guessing
    // how long it takes. But some splitters can be compressed to near-zero visible size (e.g. the
    // code/sidebar splitter when the Python execution area is expanded to fill most of the
    // screen), where the bounding box may never visibly change even though the drag still
    // succeeds (the resize logic uses the mouse's pixel delta, not the splitter's own rendered
    // geometry) -- so this is a best-effort wait, not a hard requirement:
    await expect.poll(async () => {
        const b = await splitter.boundingBox();
        return `${b?.x}:${b?.y}`;
    }, {timeout: 2000}).not.toBe(`${box.x}:${box.y}`).catch(() => { /* see comment above */ });
    await page.mouse.up();
}

export async function getSplitterPos(page: Page, locator: string) : Promise<{ x: number, y: number, width: number, height: number }> {
    const splitter = page.locator(locator);
    const start = Date.now();
    let prev: {x: number, y: number, width: number, height: number} | null = null;
    let box = await splitter.boundingBox({timeout: 5000});
    // A splitter's container can still be settling into place when we grab its position (e.g.
    // right after toggling the expanded Python-execution-area view, whose pane sizing is driven
    // by a computed getter -- App.vue's expandedPEAOverlaySplitterPane2Size -- that can itself
    // trigger a further reactive update via nextTick). Require two consecutive reads to agree
    // before trusting the position, rather than a fixed delay:
    while (Date.now() - start < 5000) {
        if (box && prev && box.x === prev.x && box.y === prev.y && box.width === prev.width && box.height === prev.height) {
            return box;
        }
        prev = box;
        await page.waitForTimeout(50);
        box = await splitter.boundingBox({timeout: 5000});
    }
    if (!box) {
        throw new Error("Could not get splitter position");
    }
    return box;
}
