import { test } from "@playwright/test";
import { enterCode } from "../support/editor";
import { checkConsoleContent, checkFrameErrorCount, runToFinish } from "../support/execution";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    // runToFinish() can wait up to 120s for Pyodide, so allow headroom (as in check-error-locations.spec.ts):
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000});
});

// Regression tests for https://github.com/k-pet-group/Strype/issues/848
// (support for rest patterns, in star-unpacking assignments and in mapping patterns in match/case).
test.describe("Rest patterns", () => {
    test("Star-unpacking in an assignment", async ({page}) => {
        await enterCode(page, ["", "", `
numbers = [10, 20, 30, 40, 50]
first, second, *rest = numbers
print(first)
print(second)
print(rest)
`.trimStart()]);
        await runToFinish(page);
        await checkConsoleContent(page, "10\n20\n[30, 40, 50]\n");
        await checkFrameErrorCount(page, 0);
    });

    test("Double-star rest in a match mapping pattern", async ({page}) => {
        await enterCode(page, ["", "", `
person = {"name": "Alice", "age": 30, "city": "London", "job": "Engineer"}
match person:
    case {"name": name, **rest}:
        print(name)
        print(rest)
`.trimStart()]);
        await runToFinish(page);
        await checkConsoleContent(page, "Alice\n{'age': 30, 'city': 'London', 'job': 'Engineer'}\n");
        await checkFrameErrorCount(page, 0);
    });
});
