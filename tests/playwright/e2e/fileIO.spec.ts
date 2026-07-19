import { test, Page } from "@playwright/test";
import { clearDefaultProject, doPagePaste, pressN } from "../support/editor";
import { checkConsoleContent, runToFinish } from "../support/execution";
import { setupStrypeTest } from "../support/general";


test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 240000});
});

function copyAssetInTemp(assetPath: string, copyFileName: string): ((page: Page) => Promise<void>) {
    const createAssetCopyCode = `text  = "" 
with open("${assetPath}","rb")  as f  :
    content  = f.read() 
with open("/tmp/${copyFileName}","wb")  as f2  :
    f2.write(content) 
`;
    return async (page) => {
        await clearDefaultProject(page);
        // clearDefaultProject leaves the caret at the top of Imports; move to Main so this paste
        // (and the test's own paste that immediately follows, with no navigation in between) both
        // land in Main in the right order -- the test's code reads the file this writes, so it
        // must run second:
        await pressN("ArrowDown", 2)(page);
        await doPagePaste(page, createAssetCopyCode);
    };
}

test.describe("Internal FileIO checkups", () => {
    test("Read N lines of an existing file (text)", async ({page}) => {
        // Ctrl/Cmd+A only selects the current section (Main), not Imports too, so it can't be used to
        // blank the whole starting project on its own -- use the shared helper instead:
        await clearDefaultProject(page);
        const readExistingFileCode = `with open("/books/fairy-tales.txt",encoding="utf-8")  as f  :
    for line_index  in range(0,5)  :
        print(f"#{line_index+1} -> {f.readline()}") 
`;
        await doPagePaste(page, readExistingFileCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, `#1 -> 

#2 -> A certain king had a beautiful garden, and in the garden stood a tree

#3 -> which bore golden apples. These apples were always counted, and about

#4 -> the time when they began to grow ripe it was found that every night one

#5 -> of them was gone. The king became very angry at this, and ordered the

`);
    });

    test("Read N bytes of an existing file (binary)", async ({page}) => {
        await clearDefaultProject(page);
        const readExistingFileCode = `with open("/images/cat-test.jpg","rb")  as f  :
    print(f.read(20)) 
`;
        await doPagePaste(page, readExistingFileCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, "b'\\xff\\xd8\\xff\\xe0\\x00\\x10JFIF\\x00\\x01\\x01\\x01\\x00`\\x00`\\x00\\x00'\n");
    });

    test("Write bytes in a new file", async ({page}) => {
        await clearDefaultProject(page);
        const writeThenReadCode = `with open("/tmp/tests.txt","wb")  as f  :
    bytes_txt  = bytearray([83,116,114,121,112,101]) 
    f.write(bytes_txt) 
with open("/tmp/tests.txt")  as f  :
    print(f.read()) 
`;
        await doPagePaste(page, writeThenReadCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, "Strype\n");
    });;

    test("Write text in an existing file", async ({page}) => {
        await copyAssetInTemp("/books/fairy-tales.txt", "test.txt")(page);
        const writeThenReadCode = `with open("/tmp/test.txt","w")  as f  :
    f.write("This is added by Strype!") 
with open("/tmp/test.txt")  as f  :
    print(f.read(100)+"|") 
`;
        await doPagePaste(page, writeThenReadCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, "This is added by Strype!|\n");
    });;

    test("Read+Write an existing file", async ({page}) => {
        await copyAssetInTemp("/books/fairy-tales.txt", "test.txt")(page);
        // First seek: +2 or +1 (the first line break on Windows or Linux) + 2 (position for "A |certain king" where | is the cursor)
        // Second seek: same except the last +2
        const firstLinebreakOSOffset = (process.platform === "win32") ? 1 : 0;
        const writeAndReadCode =`with open("/tmp/test.txt","r+", encoding="utf-8")  as f3  :
    f3.seek(3+${firstLinebreakOSOffset}) 
    f3.write("great Strype") 
    f3.seek(1+${firstLinebreakOSOffset}) 
    print(f3.read(250)+"|")
    `;
        await doPagePaste(page, writeAndReadCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, `A great Strype had a beautiful garden, and in the garden stood a tree
which bore golden apples. These apples were always counted, and about
the time when they began to grow ripe it was found that every night one
of them was gone. The king became very|
`);
    });

    test("Append text in an existing file", async ({page}) => {
        await copyAssetInTemp("/books/fairy-tales.txt", "test.txt")(page);
        const appendThenReadCode = `with open("/tmp/test.txt","a")  as f  :
    f.write("This is added by Strype!") 
with open("/tmp/test.txt", encoding="utf-8")  as f  :
    whole_text = f.read()
    print(whole_text[-100:]) 
`;
        await doPagePaste(page, appendThenReadCode);
        await page.waitForTimeout(200);
        // Run code and check console output
        await runToFinish(page, true);
        await checkConsoleContent(page, `e her window, and every year bore the most beautiful
roses, white and red.

This is added by Strype!
`);
    });
});
