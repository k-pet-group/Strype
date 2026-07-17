import {test, expect, Page} from "@playwright/test";
import {loadContent, save} from "../support/loading-saving";
import {readFileSync} from "node:fs";
import {setupStrypeTest} from "../support/general";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";

// Real (small) media assets -- the loaded project actually gets rendered (including decoding
// audio for its waveform preview), so placeholder/fake base64 content isn't good enough here:
const testSoundBase64 = readFileSync("src/assetsFilesystem/sounds/click.wav").toString("base64");
const testImageBase64 = readFileSync("src/assetsFilesystem/images/backgrounds/floor-tile.png").toString("base64");

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

test.describe("Load media literals immediately followed by a method call", () => {
    // Regression test for a bug where loading a project produced saved code like
    // load_sound("...").___strype_blankplay() even though the affected line was never edited.
    //
    // Root cause: replaceMediaLiteralsAndInvalidOps() (in pythonToFrames.ts), which runs while
    // parsing loaded/pasted Python into frames, collapses a "load_sound(<string>)" name+bracket
    // pair down to a single media slot, then re-inserts a blank field/operator pair on whichever
    // side(s) need one so the media slot stays correctly delimited. For the "before" side it used
    // `s.operators.splice(i - 1, 0, ...)`. When the media literal is the very first field of its
    // expression (i == 0) -- e.g. a bare `load_sound(...).play()` statement -- that is
    // `splice(-1, 0, ...)`. A negative index in Array.splice does NOT mean "insert before index
    // 0"; it means "insert one position before the end", so the new blank operator landed in the
    // wrong place and desynchronised the fields/operators arrays from that point on. That left a
    // genuinely-blank field sitting right where the code generator treats an empty slot as
    // "adjacent to a dot", so on save it got rendered using the internal SPY placeholder text
    // (___strype_blank) instead of staying invisible.
    //
    // This corruption is introduced on every single load/paste of such a line, but it is normally
    // invisible: pasteMixedPython() schedules a follow-up DOM-based reparse of each newly-inserted
    // frame (to refresh parameter-prompt placeholders) on the next tick, and that reparse uses a
    // different, unaffected code path which overwrites the corrupted structure with a correct one.
    // The bug only survives to a save if that follow-up reparse can't find the frame's DOM element
    // yet (e.g. because it isn't mounted/rendered at that exact moment) -- a timing-dependent race,
    // which is why it was reported as intermittent and why only some lines were affected in a
    // given session. That means this test is exercising a race: driving the real "Load Project"
    // flow and checking the saved output afterwards, the same way a user would hit this, rather
    // than reaching in to inspect the mid-repair state directly. It may not reliably reproduce the
    // bug if it regresses (the follow-up reparse usually wins), but it does cover the actual
    // user-facing behaviour without relying on internals that only exist for testing.
    async function assertNoBlankMarkerAfterLoad(page: Page, mainSectionContent: string) {
        const spySource = [
            "#(=> Strype:1:std",
            "#(=> Section:Imports",
            "#(=> Section:Definitions",
            "#(=> Section:Main",
            mainSectionContent,
            "#(=> Section:End",
            "",
        ].join("\n");

        await loadContent(page, spySource);
        const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
        expect(output).not.toContain("___strype_blank");
    }

    test("Load a sound literal followed by a method call, as a bare statement", async ({page}) => {
        await assertNoBlankMarkerAfterLoad(page, `load_sound("data:audio/x-wav;base64,${testSoundBase64}").play() `);
    });
    test("Load an image literal followed by a method call, as a bare statement", async ({page}) => {
        await assertNoBlankMarkerAfterLoad(page, `load_image("data:image/png;base64,${testImageBase64}").get_width() `);
    });
    test("Load a sound literal followed by a method call, on the RHS of an assignment", async ({page}) => {
        await assertNoBlankMarkerAfterLoad(page, `mySound  = load_sound("data:audio/x-wav;base64,${testSoundBase64}").play() `);
    });
    test("Load several sound-literal method call lines together", async ({page}) => {
        await assertNoBlankMarkerAfterLoad(page, [
            `load_sound("data:audio/x-wav;base64,${testSoundBase64}").play() `,
            `load_sound("data:audio/x-wav;base64,${testSoundBase64}").play() `,
            `load_sound("data:audio/x-wav;base64,${testSoundBase64}").play() `,
        ].join("\n"));
    });
});
