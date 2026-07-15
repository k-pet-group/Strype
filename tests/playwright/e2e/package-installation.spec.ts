import { test } from "@playwright/test";
import { enterCode } from "../support/editor";
import { checkConsoleContent, runToFinish } from "../support/execution";
import { setupStrypeTest } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "firefox") {
        // For some reasons these tests take ages on Firefox on CI, even though they work locally on Firefox:
        testInfo.skip(true, "Skipping on Firefox due to slowness");
    }
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 120000});
});

test.describe("Check in-built packages", () => {
    test("Check numpy", async ({page}) => {
        await enterCode(page, ["import numpy as np", "", `
print("NumPy version:", np.__version__)
a = np.array([1, 2, 3])
b = np.array([4, 5, 6])
print("Array a:", a)
print("Array b:", b)
c = a + b
print("a + b:", c)
print("Mean of c:", np.mean(c))
`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
NumPy version: 2.2.5
Array a: [1 2 3]
Array b: [4 5 6]
a + b: [5 7 9]
Mean of c: 7.0
`.trimStart());
    });

    test("Check pandas", async ({page}) => {
        await enterCode(page, ["import pandas as pd", "", `
print("Pandas version:", pd.__version__)
data = {"A": [1, 2, 3], "B": [4, 5, 6]}
df = pd.DataFrame(data)
print("DataFrame:\\n", df)
print("Column A sum:", df["A"].sum())
print("Column B mean:", df["B"].mean())
df["C"] = df["A"] + df["B"]
print("New column C:\\n", df)
`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
Pandas version: 2.3.3
DataFrame:
    A  B
0  1  4
1  2  5
2  3  6
Column A sum: 6
Column B mean: 5.0
New column C:
    A  B  C
0  1  4  5
1  2  5  7
2  3  6  9
`.trimStart());
    });

    test("Check pandas and numpy", async ({page}) => {
        await enterCode(page, ["import numpy as np\nimport pandas as pd", "", `
arr = np.arange(1, 6)
print("NumPy array:", arr)
df = pd.DataFrame({"Numbers": arr})
print("DataFrame:\\n", df)
df["Squared"] = df["Numbers"] ** 2
print("Squared column:\\n", df)
print("Sum of squared:", df["Squared"].sum())
`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
NumPy array: [1 2 3 4 5]
DataFrame:
    Numbers
0        1
1        2
2        3
3        4
4        5
Squared column:
    Numbers  Squared
0        1        1
1        2        4
2        3        9
3        4       16
4        5       25
Sum of squared: 55
`.trimStart());
    });
});

test.describe("Check micropip packages", () => {
    test("Check micropip package", async ({page}) => {
        await enterCode(page, ["#(=> Library:micropip:snowballstemmer\nimport snowballstemmer as ss", "", `
stemmer = ss.stemmer('english')
print(stemmer.stemWords('go goes going gone'.split()))
`]);
        await runToFinish(page);
        await checkConsoleContent(page, "['go', 'goe', 'go', 'gone']\n");
    });
});

test.describe("Check user libraries", () => {
    test("Check http library shows files", async ({page}) => {
        await enterCode(page, ["#(=> Library:http://localhost:8089/test-library/\nfrom pathlib import Path\n", "", `
for item in sorted(next(Path("/strype_libraries").glob("*/")).iterdir()):
    print(item.name)
`]);
        await runToFinish(page);
        await checkConsoleContent(page, `
autocomplete.json
demos
mediacomp.py
print_message.py
`.trimStart());
    });
    test("Check http library", async ({page}) => {
        await enterCode(page, ["#(=> Library:http://localhost:8089/test-library/\nimport print_message as p", "", `
p.print_message_1()
`]);
        await runToFinish(page);
        await checkConsoleContent(page, "Hello everyone!\n");
    });
    test("Check http library, run twice", async ({page}) => {
        await enterCode(page, ["#(=> Library:http://localhost:8089/test-library/\nimport print_message as p", "", `
p.print_message_1()
p.print_message_2()
`]);
        await runToFinish(page);
        await runToFinish(page);
        await checkConsoleContent(page, "Hello everyone!\nGoodbye!\n");
    });
});
