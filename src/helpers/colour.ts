// Small colour-conversion helpers used by the colour picker dialog (Ctrl-Shift-L).

// Parses any CSS-recognised colour representation (a hex code such as "#f00"/"#ff0000", a
// recognised CSS colour name such as "red", or an rgb()/hsl() function) into a normalised
// "#rrggbb" hex string, or null if the input isn't a colour the browser recognises.
// We piggy-back on the canvas 2D context's fillStyle setter, which silently ignores invalid
// assignments (leaving the previous value untouched) and normalises valid ones -- opaque colours
// always come back as "#rrggbb" in every browser we support, which is exactly what we want without
// having to ship our own CSS colour name table.
let parseCanvasCtx: CanvasRenderingContext2D | null = null;
export function parseColourToHex(input: string): string | null {
    if (!input || !input.trim()) {
        return null;
    }
    if (!parseCanvasCtx) {
        parseCanvasCtx = document.createElement("canvas").getContext("2d");
    }
    if (!parseCanvasCtx) {
        return null;
    }
    // Sentinel that's vanishingly unlikely to be the actual input, so we can detect a no-op
    // (i.e. rejected) assignment below:
    const sentinel = "#010203";
    parseCanvasCtx.fillStyle = sentinel;
    parseCanvasCtx.fillStyle = input;
    const result = parseCanvasCtx.fillStyle;
    if (result === sentinel && input.trim().toLowerCase() !== sentinel) {
        return null;
    }
    // Colours with alpha come back as "rgba(...)"; we don't support those here (the string literal
    // we produce is always opaque), so treat them as unparseable rather than losing the alpha silently:
    if (!/^#[0-9a-f]{6}$/.test(result)) {
        return null;
    }
    return result;
}

// Strict predicate used for auto-detection (typing-blur and python-load) of a colour literal:
// exactly 6 hex digits after "#", unlike parseColourToHex's lenient CSS-colour parsing (which is
// only used to seed the picker from arbitrary content).
export function isHexColourLiteral(s: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(s);
}

export function hexToHsv(hex: string): { h: number, s: number, v: number } {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === r) {
            h = 60 * (((g - b) / delta) % 6);
        }
        else if (max === g) {
            h = 60 * ((b - r) / delta + 2);
        }
        else {
            h = 60 * ((r - g) / delta + 4);
        }
    }
    if (h < 0) {
        h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s: s * 100, v: v * 100 };
}

export function hexToHsl(hex: string): { h: number, s: number, l: number } {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === r) {
            h = 60 * (((g - b) / delta) % 6);
        }
        else if (max === g) {
            h = 60 * ((b - r) / delta + 2);
        }
        else {
            h = 60 * ((r - g) / delta + 4);
        }
    }
    if (h < 0) {
        h += 360;
    }
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) {
        [r, g, b] = [c, x, 0];
    }
    else if (h < 120) {
        [r, g, b] = [x, c, 0];
    }
    else if (h < 180) {
        [r, g, b] = [0, c, x];
    }
    else if (h < 240) {
        [r, g, b] = [0, x, c];
    }
    else if (h < 300) {
        [r, g, b] = [x, 0, c];
    }
    else {
        [r, g, b] = [c, 0, x];
    }
    const toHexByteHsl = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return "#" + toHexByteHsl(r) + toHexByteHsl(g) + toHexByteHsl(b);
}

export function hsvToHex(h: number, s: number, v: number): string {
    const sNorm = s / 100;
    const vNorm = v / 100;
    const c = vNorm * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = vNorm - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) {
        [r, g, b] = [c, x, 0];
    }
    else if (h < 120) {
        [r, g, b] = [x, c, 0];
    }
    else if (h < 180) {
        [r, g, b] = [0, c, x];
    }
    else if (h < 240) {
        [r, g, b] = [0, x, c];
    }
    else if (h < 300) {
        [r, g, b] = [x, 0, c];
    }
    else {
        [r, g, b] = [c, 0, x];
    }
    const toHexByte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return "#" + toHexByte(r) + toHexByte(g) + toHexByte(b);
}

// Colour-family data for the picker's "pick a family, then a shade" flow (ColourPickerDlg.vue).
// Hue ranges deliberately overlap neighbouring families (e.g. Red reaches from near-orange to
// near-purple/magenta) rather than each being a narrow band around one "pure" hue, and saturation/
// lightness ranges are wide enough that a handful of grid steps land clearly apart rather than
// clustering together.
export interface ColourFamily {
    key: string;
    nameKey: string; // i18n key for the family's display name
    hue: [number, number];
    sat: [number, number];
    light: [number, number];
    // Overrides the shared GOOD_CHIP_SAT/GOOD_CHIP_LIGHT used to render this family's hue chips.
    // Needed for Brown: at the shared vivid tone, Brown's hue chips are indistinguishable from
    // Orange's -- Brown only reads as brown at low saturation and lowish lightness.
    chipSat?: number;
    chipLight?: number;
}

export const COLOUR_FAMILIES: ColourFamily[] = [
    { key: "red", nameKey: "colourPicker.familyRed", hue: [-60, 30], sat: [40, 95], light: [25, 70] },
    { key: "orange", nameKey: "colourPicker.familyOrange", hue: [5, 55], sat: [50, 95], light: [35, 68] },
    { key: "yellow", nameKey: "colourPicker.familyYellow", hue: [35, 70], sat: [55, 98], light: [40, 72] },
    { key: "green", nameKey: "colourPicker.familyGreen", hue: [80, 165], sat: [20, 80], light: [18, 62] },
    { key: "teal", nameKey: "colourPicker.familyTeal", hue: [150, 205], sat: [25, 85], light: [18, 58] },
    { key: "blue", nameKey: "colourPicker.familyBlue", hue: [195, 250], sat: [30, 90], light: [22, 68] },
    { key: "purple", nameKey: "colourPicker.familyPurple", hue: [245, 300], sat: [20, 80], light: [22, 68] },
    { key: "pink", nameKey: "colourPicker.familyPink", hue: [285, 345], sat: [30, 90], light: [42, 82] },
    { key: "brown", nameKey: "colourPicker.familyBrown", hue: [5, 55], sat: [15, 65], light: [10, 50], chipSat: 48, chipLight: 30 },
    { key: "grey", nameKey: "colourPicker.familyGrey", hue: [0, 0], sat: [0, 0], light: [0, 100] },
];

export const HUE_CHIP_COUNT = 5;
export const GOOD_CHIP_SAT = 72;
export const GOOD_CHIP_LIGHT = 52;

// Row-by-row saturation-option counts for a family's shade grid, light end to dark end: full
// choice near the light end, narrowing toward the dark end where saturation stops making a
// visible difference (in HSL, lightness 0 is black regardless of saturation).
export const SHADE_ROW_SAT_COUNTS = [4, 4, 2, 1];

// Greyscale bands, light end to dark end: same shape as SHADE_ROW_SAT_COUNTS, but each "column" is
// a finer lightness step within the band (there's no saturation axis for grey), and the bottom
// band collapses to exactly one swatch: true black.
export const GREY_SHADE_BANDS: { light: [number, number], count: number }[] = [
    { light: [80, 100], count: 4 },
    { light: [52, 78], count: 4 },
    { light: [20, 46], count: 2 },
    { light: [0, 0], count: 1 },
];

export function familyHasHueChoice(family: ColourFamily): boolean {
    return family.hue[1] - family.hue[0] > 3;
}

export function midOfRange(range: [number, number]): number {
    return (range[0] + range[1]) / 2;
}
