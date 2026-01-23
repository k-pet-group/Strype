import {Page} from "@playwright/test";

export async function addFakeClipboard(page: Page) : Promise<void> {
    // We must use a fake clipboard object to avoid issues with browser clipboard permissions:
    await page.addInitScript(() => {
        let mockTextContent = "<empty>";
        let mockItems: ClipboardItem[] = [];
        const mockClipboard = {
            write: async (items: ClipboardItem[]) => {
                mockItems = items;
                for (const item of items) {
                    try {
                        const b = await item.getType("text/plain");
                        mockTextContent = await b.text();
                    }
                    catch {
                        // Ignore
                    }
                }
            },
            read: async () => {
                return mockItems;
            },
            writeText: async (text: string) => {
                mockTextContent = text;
                mockItems = [{
                    types: ["text/plain"], getType: (type) => {
                        if (type === "text/plain") {
                            return Promise.resolve(new Blob([mockTextContent], { type }));
                        }
                        return Promise.reject(`Type ${type} not found`);
                    },
                }];
            },
            readText: async () => mockTextContent,
        };

        // override the native clipboard API
        Object.defineProperty(window.navigator, "clipboard", {
            value: mockClipboard,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    });
}
