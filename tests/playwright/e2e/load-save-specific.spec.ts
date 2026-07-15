import {test, expect, Page} from "@playwright/test";
import {loadContent, save} from "../support/loading-saving";
import {readFileSync} from "node:fs";
import {setupStrypeTest} from "../support/general";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
});

test.describe("Load/save near empty files", () => {
    test("Load and save a completely empty file", async ({page}) => {
        await loadContent(page, "");
        // It should output a near-blank SPY:
        const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
        expect(output).toEqual(`#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
#(=> Section:End
`);
    });
    test("Load and save a file with a single newline", async ({page}) => {
        await loadContent(page, "\n");
        // It should output a near-blank SPY with a single blank line:
        const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
        expect(output).toEqual(`#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
#(=> Section:End
`);
    });
    test("Load and save a file with a single space", async ({page}) => {
        await loadContent(page, "");
        // It should output a near-blank SPY:
        const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
        expect(output).toEqual(`#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
#(=> Section:End
`);
    });
});

async function testLoadSaveMainLines(page: Page, content: string) {
    await loadContent(page, content + "\n");
    const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
    expect(output).toEqual(`#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
${content}
#(=> Section:End
`);
}

test.describe("Load/save unusual operators", () => {
    test("Load and save slices", async ({page}) => {
        await testLoadSaveMainLines(page, `
a[1:5] 
b[:6] 
c[2:] 
d[:] 
e[::9] 
f[4:10:3] 
g[::-1] 
h[:7:] 
i[::] 
j[8::] `.trimStart());
    });
    test("Load and save slices (assignment variant)", async ({page}) => {
        await testLoadSaveMainLines(page, `
a[1:5]  = b[:6] 
c[2:]  = d[:] 
e[::9]  = f[4:10:3] 
g[::-1]  = h[:7:] 
i[::]  = j[8::] `.trimStart());
    });
    
    test("Load and save advanced word operators", async ({page}) => {
        // We don't necessarily support all these semantically, but
        // we'd like them to at least parse and save again:
        await testLoadSaveMainLines(page, `
expr_alpha  = value_alpha if cond_alpha else alt_alpha 
expr_beta  = (x_beta if cond_beta else y_beta) if outer_beta else z_beta 
expr_gamma  = [g_gamma for g_gamma in seq_gamma] 
expr_delta  = [d_delta for d_delta in seq_delta if d_delta>0] 
expr_epsilon  = {e_epsilon for e_epsilon in seq_epsilon if e_epsilon%2==0} 
expr_zeta  = {k_zeta:v_zeta for (k_zeta,v_zeta) in pairs_zeta} 
expr_eta  = tuple(h_eta for h_eta in seq_eta) 
expr_theta  = sum(t_theta for t_theta in seq_theta if t_theta<10) `.trimStart());
        // We don't (yet?) support async and await:
        // expr_iota = [i_iota async for i_iota in aseq_iota]
        // expr_kappa = await coro_kappa()
    });
});
