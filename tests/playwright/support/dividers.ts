import {Page} from "@playwright/test";

export async function dragDividerTo(page: Page, locator: string, x: number, y: number): Promise<void> {
    const box = await getSplitterPos(page, locator);

    const currentX = box.x + box.width / 2;
    const currentY = box.y + box.height / 2;

    await page.mouse.move(currentX, currentY);
    await page.mouse.down();
    await page.waitForTimeout(2 * 1000);
    await page.mouse.move(x, y, {steps: 1});
    await page.waitForTimeout(2 * 1000);
    await page.mouse.up();
    await page.waitForTimeout(2 * 1000);

}

export async function getSplitterPos(page: Page, locator: string) : Promise<{ x: number, y: number, width: number, height: number }> {
    const splitter = await page.locator(locator);
    const box = await splitter.boundingBox({timeout: 5000});
    if (!box) {
        throw new Error("Could not get splitter position");
    }
    return box;
}
