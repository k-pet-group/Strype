// This file helps in handling the up/down arrow keys in a set of spans which might have wrapped
// The main function is handleVerticalCaretMove at the end of the file, the others are internal helpers.
// It helps us find the horizontally aligned position on the line below/above so that up/down key
// moves to the position you would expect, looking at the screen.
function getCaretScreenPosition() : { x: number; y: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.focusNode) {
        return null;
    }
    
    return getCaretRect(sel.focusNode, sel.focusOffset);
}

// Note: the x is the left, and y is the bottom of the character as it's easier to reliably determine 
type SpanRect = { span: HTMLSpanElement, offset: number, x: number, y: number };

// Given a Node and an offset, finds the x and y (as per SpanRect type, above)
function getCaretRect(node : Node, offset : number) : { offset: number, x: number, y: number } {
    const range = document.createRange();

    // In most cases, we can make a zero-sized selection and ask for the bounding rect:
    range.setStart(node, offset);
    range.collapse(true);

    const domRect = range.getBoundingClientRect();
    let pos = { x: domRect.x, y: domRect.bottom};

    // However, if the zero-sized selection is at the start of a new line (i.e. immediately after a \n),
    // all the browsers report its location as the end of the previous line, not the beginning of the new one
    // So we have to ask for the location of the following character:
    if (offset > 0 && node.nodeValue && node.nodeValue[offset - 1] === "\n" && offset + 1 < node.nodeValue.length) {
        // Measure first character of the next line instead
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);

        const charRect = range.getBoundingClientRect();
        pos = {x: charRect.left, y: charRect.bottom };
    }
    
    range.detach();

    return {...pos, offset: offset};
}


function getCharRects(span : HTMLSpanElement) : SpanRect[] {
    const rects : SpanRect[] = [];
    const text = span.textContent || "";
    const node = span.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
        return rects;
    }

    for (let i = 0; i <= text.length; i++) {
        // Don't consider positioning after a final zero-width space:
        if (i === text.length && text[i - 1] == "\u200B") {
            break;
        }
        rects.push({...getCaretRect(node, i), span});
    }
    return rects;
}

type LineInfo = { y: number, rects: SpanRect[] };

function groupRectsByLine(rects : SpanRect[], lineTolerance = 5) : LineInfo[] {
    const lines : LineInfo[] = [];
    rects.sort((a, b) => a.y - b.y);

    for (const rect of rects) {
        const line = lines.find((line) => Math.abs(line.y - rect.y) <= lineTolerance);
        if (line) {
            line.rects.push(rect);
        }
        else {
            lines.push({ y: rect.y, rects: [rect] });
        }
    }

    return lines;
}

function moveCaretToPosition(span : HTMLSpanElement, offset : number) : void {
    const range = document.createRange();
    const node = span.firstChild;
    if (!node) {
        return;
    }
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

function findClosestRectInLine(lineRects : SpanRect[], targetX : number) : SpanRect | null {
    let closest = null;
    let minDx = Infinity;
    for (const r of lineRects) {
        const dx = Math.abs(r.x - targetX);
        if (dx < minDx) {
            minDx = dx;
            closest = r;
        }
    }
    return closest;
}

// Moves the caret up or down within the given list of spans, by finding the vertical
// position that is closest to being directly above the current cursor position.
// If there was such a position, it is returned; if there was nowhere above to move to, null is returned.
export function handleVerticalCaretMove(spans: HTMLSpanElement[], direction : "up" | "down") : { span: HTMLSpanElement, offset: number } | null {
    const caretPos = getCaretScreenPosition();
    if (!caretPos) {
        return null;
    }

    //const spans = Array.from(document.querySelectorAll("span[contenteditable=\"true\"]"));
    const allRects = spans.flatMap(getCharRects);
    const lines = groupRectsByLine(allRects);

    const currentLineIndex = lines.findIndex((line) => Math.abs(line.y - caretPos.y) < 5);
    if (currentLineIndex === -1) {
        return null;
    }

    const targetIndex = direction === "up" ? currentLineIndex - 1 : currentLineIndex + 1;
    if (targetIndex < 0 || targetIndex >= lines.length) {
        return null;
    }

    const targetLine = lines[targetIndex];
    const closest = findClosestRectInLine(targetLine.rects, caretPos.x);
    if (closest) {
        moveCaretToPosition(closest.span, closest.offset);
    }
    return closest;
}
