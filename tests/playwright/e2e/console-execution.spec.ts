import { test, expect } from "@playwright/test";
import { enterCode } from "../support/editor";
import { checkConsoleContent, runButtonShowsRun, runToFinish, startRunning } from "../support/execution";

test.beforeEach(async ({ page, browserName }, testInfo) => {
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

test.describe("Check console after execution", () => {
    test("Check default code works", async ({page}) => {
        await runToFinish(page);
        await checkConsoleContent(page, "Hello from Strype\n");
    });

    test("Check two prints work", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nprint('World')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Hello\nWorld\n");
    });

    test("Check format string works", async ({page}) => {
        await enterCode(page, ["", "", "x=1\ny=2\nprint(f'X is {x}')\nprint(f'Y is {y}')\nprint(f\"Total is {x+y}\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "X is 1\nY is 2\nTotal is 3\n");
    });

    test("Check raw string works", async ({page}) => {
        // In raw strings with r prefix, newlines should not be recognised as escapes:
        await enterCode(page, ["", "", "print('Line 1\\nLine 2')\nprint(r\"Line 3.0\\nLine 3.1\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Line 1\nLine 2\nLine 3.0\\nLine 3.1\n");
    });
});

test.describe("Test stdin works", () => {
    test("Check input/output works", async ({page}) => {
        await enterCode(page, ["", "", "name = input('What is your name?\\n')\nprint('Hello ' + name)\n"]);
        const button = await startRunning(page);
        await expect(page.locator("#peaConsole")).toBeEnabled();
        await expect(page.locator("#peaConsole")).toBeFocused();
        await page.locator("#peaConsole").pressSequentially("George\n", {delay: 75});
        // Then it should not be running again, because it has finished:
        await runButtonShowsRun(button);
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\n");
    });

    test("Check multiple input works", async ({page}) => {
        await enterCode(page, ["", "", "name = input('What is your name?\\n')\nprint('Hello ' + name)\nspecies = input('What is your species?\\n')\nprint('Hello ' + name + ' the ' + species)\n"]);
        const button = await startRunning(page);
        await expect(page.locator("#peaConsole")).toBeEnabled();
        await expect(page.locator("#peaConsole")).toBeFocused();
        await page.locator("#peaConsole").pressSequentially("George\n", {delay: 75});
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\nWhat is your species?\n");
        // Should still be running:
        await expect(button).toContainText("Stop");
        await page.locator("#peaConsole").pressSequentially("cat\n", {delay: 75});
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\nWhat is your species?\ncat\nHello George the cat\n");
        // Then it should not be running again, because it has finished:
        await runButtonShowsRun(button);
    });
});

test.describe("Check errors show", () => {
    test("Check error shows #1", async ({page}) => {
        await enterCode(page, ["", "", "print(len(None))"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< TypeError: object of type 'NoneType' has no len() >\n  From the highlighted call in your code");
    });
    test("Check error shows #2", async ({page}) => {
        await enterCode(page, ["", "", "print('a'.foo())"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< AttributeError: 'str' object has no attribute 'foo' >\n  From the highlighted call in your code");
    });
    test("Check error shows for file reading", async ({page}) => {
        await enterCode(page, ["", "", "open(\"/does/not/exist.txt\", \"r\", encoding=\"utf-8\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< FileNotFoundError: [Errno 44] No such file or directory: '/does/not/exist.txt' >\n  From the highlighted call in your code");
    });
    
    // Check syntax error too, this use of global shows a syntax error:
    test("Check error shows for global mis-use", async ({page}) => {
        await enterCode(page, ["", `
def test():
    a = 2
    global a
`.trimStart(), "print(\"Hi!\")\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "< SyntaxError: name 'a' is assigned to before global declaration >\n  From the highlighted call in your code");
    });

    test("Check error shows after manually printing", async ({page}) => {
        await enterCode(page, ["import traceback", "", `
try:
    print(len(None))
except Exception:
    traceback.print_exc()
`]);
        await runToFinish(page);
        // Should be an error, but only one:
        await checkConsoleContent(page, /.*TypeError: object of type 'NoneType' has no len\(\).*/);
    });
});

test.describe("Test assets filesystem", () => {
    test("Check reading and processing book", async ({page}) => {
        await enterCode(page, ["", "", `
with open("/books/three-men-in-a-boat.txt", "r", encoding="utf-8") as file:
    content = file.read()
count = content.count("Montmorency")

print(f'Montmorency is mentioned {count} times.')`]);
        await runToFinish(page);
        await checkConsoleContent(page, "Montmorency is mentioned 59 times.\n");
    });
});

// Not really a console test, but relies on console output so it can be here:
test.describe("Test sounds", () => {
    test("Check loading and setting sounds", async ({page}) => {
        await enterCode(page, ["from strype.sound import *", "", `
s = Sound([-1,0,1])
print(s.get_samples())
s.set_samples([-0.5, 0.5])
print(s.get_samples())
s.set_samples([1, -1])
print(s.get_samples())`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
[-1, 0, 1]
[-0.5, 0.5]
[1, -1]
`.trimStart());
    });

    test("Check type of sound samples", async ({page}) => {
        await enterCode(page, ["from strype.sound import *", "", `
s = Sound([-1,0,1])
print(type(s.get_samples()))`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
<class 'list'>
`.trimStart());
    });

    test("Create zero length Sound", async ({page}) => {
        if (process.platform === "linux") {
            // Something about playing the sound headless on Linux in Firefox doesn't seem to work (it does on Windows)
            return;
        }
        
        await enterCode(page, ["from strype.sound import *", "", `
s = Sound([])
# Playing sound should not hang things:
s.play_and_wait()
# Nor copy to mono:
s.copy_to_mono()
print(s.get_samples())
print(type(s.get_samples()))
print(len(s.get_samples()))`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
[0]
<class 'list'>
1
`.trimStart());
    });
});

test.describe("Test console flushing and ordering", () => {
    test("Check output shows when asking for input", async ({page}) => {
        await enterCode(page, ["", "", "print('Began')\nname = input('What is your name?\\n')\nprint('Hello ' + name)\n"]);
        const button = await startRunning(page);
        await expect(page.locator("#peaConsole")).toBeEnabled();
        await expect(page.locator("#peaConsole")).toBeFocused();
        await checkConsoleContent(page, "Began\nWhat is your name?\n");
        // Stop it:
        await page.click("#runButton");
        // Then it should not be running, because it has been terminated:
        await runButtonShowsRun(button);
    });
    test("Check output shows when printing then sleeping", async ({page}) => {
        await enterCode(page, ["import time", "", "print('Began')\ntime.sleep(60)\n"]);
        const button = await startRunning(page);
        // Give it two seconds:
        await page.waitForTimeout(2000);
        // Then it should have appeared:
        await checkConsoleContent(page, "Began\n");
        // Stop it:
        await page.click("#runButton");
        // Then it should not be running, because it has been terminated:
        await runButtonShowsRun(button);
    });
});

test.describe("Test console clearing", () => {
    test("Check console clears stdout #1", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nclear_console()\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "");
    });
    test("Check console clears stdout #2", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nclear_console()\nprint('Goodbye')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Goodbye\n");
    });
    test("Check console clears stdout #3", async ({page}) => {
        await enterCode(page, ["", "", "print('First')\nclear_console()\nprint('Second')\nclear_console()\nprint('Third')\nprint('Fourth')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Third\nFourth\n");
    });
    test("Check console clears stderr #1", async ({page}) => {
        await enterCode(page, ["import traceback", "", `
try:
    print(len(None))
except Exception:
    traceback.print_exc()
clear_console()
print("Hi")
`]);
        await runToFinish(page);
        await checkConsoleContent(page, "Hi\n");
    });
    test("Check console clears stderr #2", async ({page}) => {
        await enterCode(page, ["import traceback", "", `
try:
    print(len(None))
except Exception:
    traceback.print_exc()
clear_console()
try:
    print(len(None))
except Exception:
    traceback.print_exc()
`]);
        await runToFinish(page);
        // Should be an error, but only one:
        await checkConsoleContent(page, `Traceback (most recent call last):
  File "/home/pyodide/my_program.py", line 8, in <module>
    print(len(None))
          ~~~^^^^^^
TypeError: object of type 'NoneType' has no len()
`);
    });
});
