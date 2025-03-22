import { getEditorID, getFrameContainerUID, getFrameUID } from "@/helpers/editor";

export function assertState(expectedState : string) : void {
    withSelection((info) => {
        cy.get("#" + getFrameContainerUID(-3) + " .frame-header").first().within((h) => cy.get(".labelSlot-input,.frameColouredLabel").then((parts) => {
            let s = "";
            if (!parts) {
                // Try to debug an occasional seemingly impossible failure:
                cy.task("log", "Parts is null which I'm sure shouldn't happen, came from frame: " + h);
            }
            // Since we're in an if frame, we ignore the first and last part:
            for (let i = 1; i < parts.length - 1; i++) {
                const p : any = parts[i];

                let text = p.value || p.textContent || "";

                // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
                if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                    text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
                }
                // Don't put curly brackets around strings, operators or brackets:
                if (!p.classList.contains("string-slot") && !p.classList.contains("operator-slot") && !/[([)\]$]/.exec(p.textContent)) {
                    text = "{" + text + "}";
                }
                s += text;
            }
            // There is no correspondence for _ (indicating a null operator) in the Strype interface so just ignore that:
            expect(s).to.equal(expectedState.replaceAll("_", ""));
        }));
    });
}

function withSelection(inner : (arg0: { id: string, cursorPos : number }) => void) : void {
    // We need a delay to make sure last DOM update has occurred:
    cy.wait(200);
    cy.get("#" + getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        inner({id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")});
    });
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
Cypress.Commands.add("paste",
    {prevSubject : true},
    ($element, data) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData("text", data);
        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        });

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cy.get($element).then(() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            $element[0].dispatchEvent(pasteEvent);
        });
    });

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
    cy.get("#" + getFrameUID(-3)).focus();
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
