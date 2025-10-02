import { AppName, AppPlatform, AppSPYFullPrefix, AppSPYSaveVersion } from "@/main";
import { parseCodeAndGetParseElements } from "@/parser/parser";
import { useStore } from "@/store/store";
import {StrypeLayoutDividerSettings, StrypePEALayoutMode} from "@/types/types";

export function saveDivider(divider: StrypeLayoutDividerSettings | undefined) : string | undefined {
    if (divider === undefined) {
        return undefined;
    }
    const obj: Record<string, number> = {};
    Object.entries(divider).forEach(([key, value]) => {
        if (value !== undefined) {
            obj[key] = Math.round(value * 100) / 100; // round to 2 decimals
        }
    });
    return JSON.stringify(obj);    
}

export function loadDivider(json: string | undefined): StrypeLayoutDividerSettings | undefined {
    if (json === undefined) {
        return undefined;
    }
    const obj = JSON.parse(json) as Record<string, number>;
    const map = {} as StrypeLayoutDividerSettings;
    Object.entries(obj).forEach(([key, value]) => {
        const enumKey = StrypePEALayoutMode[key as keyof typeof StrypePEALayoutMode];
        if (value !== undefined) {
            map[enumKey] = value;
        }
    });
    return map;
}

export function generateSPYFileContent(): string {
    let saveContent = parseCodeAndGetParseElements(false, "spy").parsedOutput;
    // We add the initial headers:
    const headers = new Map<string, string | undefined>();
    headers.set(AppName, AppSPYSaveVersion + ":" + AppPlatform);
    headers.set("editorCommandsSplitterPane2Size", saveDivider(useStore().editorCommandsSplitterPane2Size));
    /* IFTRUE_isPython */
    const peaLayoutMode = useStore().peaLayoutMode;
    headers.set("peaLayoutMode", peaLayoutMode === undefined ? undefined : StrypePEALayoutMode[peaLayoutMode]);
    headers.set("peaCommandsSplitterPane2Size", saveDivider(useStore().peaCommandsSplitterPane2Size));
    headers.set("peaSplitViewSplitterPane1Size", saveDivider(useStore().peaSplitViewSplitterPane1Size));
    headers.set("peaExpandedSplitterPane2Size", saveDivider(useStore().peaExpandedSplitterPane2Size));
    /* FITRUE_isPython */
    saveContent = Array.from(headers.entries()).filter(([k, v]) => v !== undefined).map((e) => AppSPYFullPrefix + " " + e[0] + ":" + e[1] + "\n").join("") + saveContent;
    return saveContent;
}
