// To avoid passing arguments in all the functions defined in this file, we fetch the shared IDs
// and CSS class names of Strype (we only do it if they are not already saved in this file)
// We also set the set the 'paste' command via standard-setup
import { isMacOSPlatform } from "@/helpers/common";
import {cleanFromHTML, waitForEditorSettled} from "../support/test-support";
import { scssVars, strypeElIds } from "./standard-setup";

export function assertState(expectedState : string, assertMessage?: string) : void {
    withSelection((info) => {
        cy.get("#" + strypeElIds.getFrameContainerUID(-3) + " ." + scssVars.frameHeaderClassName).first().within((h) => cy.get("." + scssVars.labelSlotInputClassName + ",." + scssVars.frameColouredLabelClassName + ",." + scssVars.labelSlotMediaClassName).then((parts) => {
            let s = "";
            if (!parts) {
                // Try to debug an occasional seemingly impossible failure:
                cy.task("log", "Parts is null which I'm sure shouldn't happen, came from frame: " + h);
            }
            // If we're in an if frame, we ignore the first and last part:
            const isInIf = parts[0].classList.contains(scssVars.framePythonTokenClassName) 
                && cleanFromHTML((parts[0] as any).value || parts[0].textContent || "").trim() == "if";
            for (let i = 1; i < (parts.length - (isInIf ? 1 : 0)); i++) {
                const p : any = parts[i];

                let text = cleanFromHTML(p.value || p.textContent || "");

                // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
                if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                    text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
                }
                // Don't put curly brackets around strings, operators, media slots or brackets:
                if (!p.classList.contains(scssVars.frameStringSlotClassName) && !p.classList.contains(scssVars.frameOperatorSlotClassName) 
                        && !p.classList.contains(scssVars.labelSlotMediaClassName)  && !/[([)\]$]/.exec(p.textContent)) {
                    text = "{" + text + "}";
                }

                // We use a token, "§", to replace a media slot, as we won't be able to work easily with the actual slot content.
                if(p.classList.contains(scssVars.labelSlotMediaClassName)){
                    text = "§";
                }
                s += text;
            }
            // There is no correspondence for _ (indicating a null operator) in the Strype interface so just ignore that:
            expect(s).to.equal(expectedState.replace(/(?<=([^\w]))_(?=([^\w]))/g, ""), assertMessage);
        }));
    });
}

function withSelection(inner : (arg0: { id: string, cursorPos : number }) => void) : void {
    // We need to make sure last DOM update has occurred:
    waitForEditorSettled();
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        inner({id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")});
    });
}

export function testInsert(insertion : string, result : string, canBeTestedWithPaste?: boolean) : void {
    it("Tests " + insertion, () => {
        focusEditor();
        cy.get("body").type("i");
        assertState("{$}");
        cy.get("body").type(" " + insertion);
        assertState(result);

        // TODO test caret position mapping?
        // TODO test splitting the insert like in Java
    });
    // Default is true:
    if (canBeTestedWithPaste ?? true) {
        // Test that pasting the code as part of a whole if frame works:
        it("Tests pasting " + insertion, () => {
            focusEditor();
            (cy.get("body") as any).paste("if " + insertion + ":\n    pass");
            // Ignore the dollar because the cursor won't be in there at all:
            assertState(result.replace("$", ""));
        });
    }
}

// Moves until the position within the slot is the given cursor pos, then executes the given function
function moveToPositionThen(cursorPos: number, runAfterPositionReached: () => void) {
    // This is awkward, but cypress doesn't let us set or query the cursor position directly so we have to
    // use withSelection to query, then press left/right until is the one we want:
    withSelection((cur) => {
        if (cur.cursorPos == cursorPos) {
            // We've arrived:
            runAfterPositionReached();
        }
        else if (cur.cursorPos > cursorPos) {
            cy.get("body").type("{leftarrow}");
            moveToPositionThen(cursorPos, runAfterPositionReached);
        }
        else {
            cy.get("body").type("{rightarrow}");
            moveToPositionThen(cursorPos, runAfterPositionReached);
        }
    });
}

// Reaches the targeted slot *within the slots of a frame label*.
// targetSlotSpanID is the HTML ID of the slot
// goLeft indicates if we reach the slot going leftwards (i.e. left arrow); false if going rightwards
// The method returns true if we could reached the targeted slot 
//      (false indicate that lost focus on slots, meaning we activated the blue caret, or that we are not in the same frame label structure anymore)
function reachFrameLabelSlot(targetSlotSpanID: string, goLeft: boolean): boolean{
    // First we extract the parts we are interested in: the frame label structure ID (the begining of the ID before "_slot_") and the slot ID (e.g. "2,0,4")
    // (the editable slot ID is expected to be formatted as "input_frame_<frameId>_label_<labelId>_slot_<type>_<slotID>")
    const targetFrameLabelIDPart = targetSlotSpanID.substring(0, targetSlotSpanID.indexOf("_slot_"));
    const targetSlotID = targetSlotSpanID.substring(targetSlotSpanID.lastIndexOf("_") + 1);
    // Move to the start [resp. end] of the slot and then move to the previous [resp. next] editable slot if going leftwards [resp. rightwards]
    const keyArrow = (goLeft) ? "{leftarrow}" : "{rightarrow}";
    let reachedTarget = false;
    withSelection((curPos) => {
        // As commas are special tokens in HTML selectors syntax, we need to parse them so the selector matches the element id correctly (our slot IDs may have commas).
        cy.get("#"+curPos.id.replaceAll(",","\\,")).then((el) => {
            const moveToPosCursorPos = (goLeft) ? 0 :  el.text().length;
            moveToPositionThen(moveToPosCursorPos, () => {
                cy.get("body").type(keyArrow).then(() => {
                    withSelection((neighbourPos) => {
                        // If at this stage we are no longer in the same frame label structure than the target, we do not continue
                        if(!neighbourPos.id.startsWith(targetFrameLabelIDPart)) {
                            return;
                        }

                        if(neighbourPos.id.substring(neighbourPos.id.lastIndexOf("_") + 1) != targetSlotID){
                            // We are on a slot of this frame label, but not the one we wanted, we move again:
                            reachFrameLabelSlot(targetSlotSpanID, goLeft);
                        }
                        else{
                            // We reached the target
                            reachedTarget = true;
                        }
                    });
                });
            });
        });
    });
    return reachedTarget;
}

export function focusEditor(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
}

export function testMultiInsert(multiInsertion : string, firstResult : string, secondResult : string) : void {
    it("Tests " + multiInsertion, () => {
        focusEditor();

        const startNest = multiInsertion.indexOf("{");
        const endNest = multiInsertion.indexOf("}", startNest);
        expect(startNest).to.not.equal(-1);
        expect(endNest).to.not.equal(-1);
        const before = multiInsertion.substring(0, startNest);
        const nest = multiInsertion.substring(startNest + 1, endNest);
        const after = multiInsertion.substring(endNest + 1);

        cy.get("body").type("i");
        assertState("{$}");
        if (before.length > 0) {
            cy.get("body").type(before);
        }
        withSelection((posToInsertNest) => {
            if (after.length > 0) {
                cy.get("body").type(after);
            }
            // Focus doesn't work, instead let's move the caret until we are in the right slot
            withSelection((newPosToInsert) => {
                if(newPosToInsert.id != posToInsertNest.id){
                    reachFrameLabelSlot( posToInsertNest.id, true);
                }
            });

            moveToPositionThen(posToInsertNest.cursorPos, () => {
                assertState(firstResult);
                cy.get("body").type(nest);
                assertState(secondResult);
            });
        });
    });
}

export function testInsertExisting(original : string, toInsert : string, expectedResult : string) : void {
    it("Tests " + original, () => {
        focusEditor();

        const cursorIndex = original.indexOf("$");
        expect(cursorIndex).to.not.equal(-1);
        const before = original.substring(0, cursorIndex);
        const after = original.substring(cursorIndex + 1);

        cy.get("body").type("i");
        assertState("{$}");
        if (before.length > 0) {
            cy.get("body").type(before);
        }
        withSelection((posToInsert) => {
            if (after.length > 0) {
                cy.get("body").type(after);
            }
            // Focus doesn't work, instead let's move the caret until we are in the right slot
            withSelection((newPosToInsert) => {
                if(newPosToInsert.id != posToInsert.id){
                    reachFrameLabelSlot( posToInsert.id, true);
                }
            });

            moveToPositionThen(posToInsert.cursorPos, () => {
                cy.get("body").type(toInsert);
                assertState(expectedResult);
            });
        });
    });
}

export function testBackspace(originalInclBksp : string, expectedResult : string, testBackspace = true, testDelete = true) : void {
    const bkspIndex = originalInclBksp.indexOf("\b");
    if (testBackspace) {
        it("Tests Backspace " + originalInclBksp.replace("\b", "\\b"), () => {
            focusEditor();

            expect(bkspIndex).to.not.equal(-1);
            const before = originalInclBksp.substring(0, bkspIndex);
            const after = originalInclBksp.substring(bkspIndex + 1);

            cy.get("body").type("i");
            assertState("{$}");
            if (before.length > 0) {
                cy.get("body").type(before);
            }
            withSelection((posToInsert) => {
                if (after.length > 0) {
                    cy.get("body").type(after);
                }

                // Focus doesn't work, instead let's move the caret until we are in the right slot
                withSelection((newPosToInsert) => {
                    if(newPosToInsert.id != posToInsert.id){
                        reachFrameLabelSlot( posToInsert.id, true);
                    }
                });

                // We are somewhere in the slot we wanted to be, just make sure we now get to the right position
                moveToPositionThen(posToInsert.cursorPos, () => {
                    cy.get("body").type("{backspace}");
                    assertState(expectedResult);
                });
            });
        });
    }
    if (bkspIndex > 0 && testDelete) {
        it("Tests Delete " + originalInclBksp.replace("\b", "\\b"), () => {
            focusEditor();

            const before = originalInclBksp.substring(0, bkspIndex - 1);
            const after = originalInclBksp.substring(bkspIndex - 1, bkspIndex) + originalInclBksp.substring(bkspIndex + 1);

            cy.get("body").type("i");
            assertState("{$}");
            if (before.length > 0) {
                cy.get("body").type(before);
            }
            withSelection((posToInsert) => {
                if (after.length > 0) {
                    cy.get("body").type(after);
                }

                // Focus doesn't work, instead let's move the caret until we are in the right slot
                withSelection((newPosToInsert) => {
                    if(newPosToInsert.id != posToInsert.id){
                        reachFrameLabelSlot( posToInsert.id, true);
                    }
                });

                // We are now somewhere in the slot we want to be, we just make sure that's at the right position
                moveToPositionThen(posToInsert.cursorPos, () => {
                    cy.get("body").type("{del}");
                    assertState(expectedResult);
                });
            });
        });
    }
}

export enum PushBracketArrow {
    MODIF_LEFT,
    MODIF_RIGHT,
    LEFT,
    RIGHT,
    HOME, //to reach the start of a slot struct in one go
    END, // to reach the end of a slot struct in one go
}

export function testPushBracket(original: string, expectedResults: string[], pushSequence: PushBracketArrow[], withMediaSlots?: boolean): void {
    // The test aims to test the "push" bracket functionality, which allows moving one bracket of a pair.
    // The test starts with one expression provided by the argument "original", in which $ denotes the current cursor position to start the test at.
    // Then, the test will perform a sequence of left/right pushes (pushSequence, containing enum values indicating a push or simple move to the left or to the right).
    // The expected results after each individual push are provided in expectedResults (with $ denoting the expected cursor position).
    // The test will fail if there is a length inconsitency between the two array arguments, the cursor position is missing in the args,
    // or if an expected result is not met.
    // IMPORTANT NOTE: the test as described does NOT handle media content in the original. To use media slots, we need another approach: 
    // original is a full length code text to *paste* in an empty slot. Therefore the $ sign is ignored (the cursor will logically expected to be
    // at the end of the slots).
    it("Tests " + original, () => {
        // Sanity check of the test
        expect(expectedResults.length).to.equal(pushSequence.length, "Test args error: the number of 'pushes' and the number of expected results should match !");
        if(!withMediaSlots){
            expect(original.match(/\$/g)?.length).to.equal(1, "Test args error: original should contain one and only one cursor position char ($).");
        }
        expectedResults.forEach((res, index) => expect(res.match(/\$/g)?.length).to.eq(1, "Test args error: expectedResults["+index+"] should contain one and only one cursor position char ($)."));

        // Actual test
        focusEditor();
      
        if(withMediaSlots){
            // With media slots, "writing" direct code in the frame isn't working to generate the media slots: paste works so we use this approach
            (cy.get("body") as any).paste(original);
            waitForEditorSettled();
            // Bring the caret to the end of the slots
            cy.get("body").type("{leftArrow}");
            waitForEditorSettled();
            // And do the tests: 
            doTestPushBracket(original, expectedResults, pushSequence);
        }
        else{ 
            cy.get("body").type("i");
            assertState("{$}");

            const cursorIndex = original.indexOf("$");
            const before = (cursorIndex > -1) ? original.substring(0, cursorIndex) : original;
            const after = (cursorIndex > -1) ? original.substring(cursorIndex + 1) : "";

            if (before.length > 0) {
                cy.get("body").type(before);
            }
            withSelection((posToInsert) => {
                if (after.length > 0) {
                    cy.get("body").type(after);
                }
                // Focus doesn't work, instead let's move the caret until we are in the right slot
                withSelection((newPosToInsert) => {
                    if(newPosToInsert.id != posToInsert.id){
                        reachFrameLabelSlot( posToInsert.id, true);
                    }
                });

                moveToPositionThen(posToInsert.cursorPos, () => {
                    doTestPushBracket(original, expectedResults, pushSequence);
                });
            });
        }    
    });
}

function doTestPushBracket(original: string, expectedResults: string[], pushSequence: PushBracketArrow[]){
    pushSequence.forEach((typedArrow, index) => {
        const keytype = `{${(typedArrow == PushBracketArrow.MODIF_LEFT || typedArrow == PushBracketArrow.MODIF_RIGHT ) ? (isMacOSPlatform() ? "ctrl+" : "alt+") : ""}` 
                        + `${(typedArrow == PushBracketArrow.LEFT || typedArrow == PushBracketArrow.MODIF_LEFT) 
                            ? "leftArrow" 
                            : ((typedArrow == PushBracketArrow.RIGHT || typedArrow == PushBracketArrow.MODIF_RIGHT) 
                                ? "rightArrow"
                                : ((typedArrow == PushBracketArrow.HOME) ? "home" : "end"))}}`;
        cy.get("body").type(keytype).then(() => assertState(expectedResults[index],
            `assertion for expectedResults[${index}] (from <${(index > 0) ? expectedResults[index - 1] : original}>, doing ${PushBracketArrow[typedArrow]})`));
    });
}
