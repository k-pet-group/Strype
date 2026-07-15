import { test, expect } from "@playwright/test";
import { enterCode } from "../support/editor";
import { checkConsoleContent, checkFrameErrorCount, runButtonShowsRun, runToFinish, setupGraphicsRedrawObserver, startRunning, waitForConsoleSettled } from "../support/execution";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 120000});
});

test.describe("Check console after execution", () => {
    test("Check default code works", async ({page}) => {
        await runToFinish(page);
        await checkConsoleContent(page, "Hello from Strype\n");
        await checkFrameErrorCount(page, 0);
    });

    test("Check two prints work", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nprint('World')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Hello\nWorld\n");
        await checkFrameErrorCount(page, 0);
    });

    test("Check format string works", async ({page}) => {
        await enterCode(page, ["", "", "x=1\ny=2\nprint(f'X is {x}')\nprint(f'Y is {y}')\nprint(f\"Total is {x+y}\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "X is 1\nY is 2\nTotal is 3\n");
        await checkFrameErrorCount(page, 0);
    });

    test("Check raw string works", async ({page}) => {
        // In raw strings with r prefix, newlines should not be recognised as escapes:
        await enterCode(page, ["", "", "print('Line 1\\nLine 2')\nprint(r\"Line 3.0\\nLine 3.1\")"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Line 1\nLine 2\nLine 3.0\\nLine 3.1\n");
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
    });

    test("Check type of sound samples", async ({page}) => {
        await enterCode(page, ["from strype.sound import *", "", `
s = Sound([-1,0,1])
print(type(s.get_samples()))`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
<class 'list'>
`.trimStart());
        await checkFrameErrorCount(page, 0);
    });

    test("Create zero length Sound", async ({page, browserName}) => {
        if (browserName === "firefox") {
            // Something about playing sound headless in Firefox doesn't seem to work (it does in Chromium)
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
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
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
        await checkFrameErrorCount(page, 0);
    });
});

test.describe("Test console clearing", () => {
    test("Check console clears stdout #1", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nclear_console()\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "");
        await checkFrameErrorCount(page, 0);
    });
    test("Check console clears stdout #2", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nclear_console()\nprint('Goodbye')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Goodbye\n");
        await checkFrameErrorCount(page, 0);
    });
    test("Check console clears stdout #3", async ({page}) => {
        await enterCode(page, ["", "", "print('First')\nclear_console()\nprint('Second')\nclear_console()\nprint('Third')\nprint('Fourth')\n"]);
        await runToFinish(page);
        await checkConsoleContent(page, "Third\nFourth\n");
        await checkFrameErrorCount(page, 0);
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
        // Should not show error because we caught it:
        await checkFrameErrorCount(page, 0);
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
  File "/home/pyodide/my_program.py", line 9, in <module>
    print(len(None))
          ~~~^^^^^^
TypeError: object of type 'NoneType' has no len()
`);
        // Should not show error because we caught it:
        await checkFrameErrorCount(page, 0);
    });
});

test.describe("Check console prints don't queue up after stopping", () => {
    for (let runTime of [3, 10, 30]) {
        test(`Check console stops printing time within seconds of stopping after running for ${runTime} seconds`, async ({page}) => {
            await enterCode(page, ["from time import time", "", `
i = 0
while True:
    print(time())`]);
            const runButton = await startRunning(page, true);
            await page.waitForTimeout(runTime * 1000);
            // We fetch the console content:
            let consoleValue = await page.locator("#peaConsole").inputValue();
            // Ignore the last line because there is a chance it was incomplete; look at the one before:
            const lastNumberWhileRunning = Number(consoleValue.split("\n")?.at(-2)?.trim());
            // Now we stop:
            await runButton.click();
            await runButtonShowsRun(runButton, true);
            // Wait for slush to print if there was some (shouldn't be, but that's what we're testing...) --
            // wait until the console actually stops changing, rather than guessing how long that takes:
            await waitForConsoleSettled(page);
            // Then check the last actual printed line:
            consoleValue = await page.locator("#peaConsole").inputValue();
            const lastNumberAfterStopping = Number(consoleValue.split("\n")?.at(-2)?.trim());
            // Should have stopped printing within 10 seconds (should be less, but CI can be slow...):
            expect(lastNumberAfterStopping).toBeLessThan(lastNumberWhileRunning + 10);
        });

        test(`Check console stops printing literal within seconds of stopping after running for ${runTime} seconds`, async ({page}) => {
            await enterCode(page, ["", "", `
while True:
    print("Hi")`]);
            const runButton = await startRunning(page, true);
            await page.waitForTimeout(runTime * 1000);
            // We fetch the console content:
            let consoleValue = await page.locator("#peaConsole").inputValue();
            // Divide by 3 ("Hi\n".length) to get lines:
            const lengthWhileRunning = consoleValue.length / 3;
            const linesPerSecond = lengthWhileRunning / runTime;
            // Now we stop:
            await runButton.click();
            await runButtonShowsRun(runButton, true);
            // Wait for slush to print if there was some (shouldn't be, but that's what we're testing...):
            await page.waitForTimeout(10_000);
            // Then check the last actual printed line:
            consoleValue = await page.locator("#peaConsole").inputValue();
            const lengthAfterStopping = consoleValue.length / 3;
            // Should have stopped printing soon after (within 4 seconds' worth)  (should be less, but CI can be slow...):
            expect(lengthAfterStopping).toBeLessThan(lengthWhileRunning + linesPerSecond * 4);
        });

        test(`Check graphics actor stops moving within seconds of stopping after running for ${runTime} seconds`, async ({page}) => {
            // This is the same underlying bug as the console print tests above (async requests/updates
            // queueing up faster than the main thread can service them, so that Stop doesn't take effect
            // for a long time), but for sprite/graphics updates: those are sent on their own dedicated
            // MessagePort (see self.updatePort in python-execution.ts) rather than through the throttled
            // makeRequest/makeRawRequest path, so a tight movement loop is a more direct way to provoke it.
            await enterCode(page, ["from strype.graphics import *", "", `
cat = Actor('cat-test.jpg')
while True:
    cat.move(5)`]);
            await setupGraphicsRedrawObserver(page);
            const runButton = await startRunning(page, true);
            await page.waitForTimeout(runTime * 1000);
            // We use the number of actual canvas redraws (see setupGraphicsRedrawObserver) as a proxy for
            // "the actor visibly moved", since there's no printed output to inspect here:
            const redrawsWhileRunning = await page.evaluate(() => (window as any).__strypeGraphicsRedrawCount ?? 0);
            const redrawsPerSecond = redrawsWhileRunning / runTime;
            // Now we stop:
            await runButton.click();
            await runButtonShowsRun(runButton, true);
            // Wait to see if it keeps moving after we've stopped (it shouldn't):
            await page.waitForTimeout(10_000);
            const redrawsAfterStopping = await page.evaluate(() => (window as any).__strypeGraphicsRedrawCount ?? 0);
            // Should have stopped moving within seconds of stopping (should be less, but CI can be slow...):
            expect(redrawsAfterStopping).toBeLessThan(redrawsWhileRunning + redrawsPerSecond * 4);
        });
    }
});
