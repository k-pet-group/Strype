import { fetchUserCountry, type UserCountry } from "@/helpers/analyticsCountry";
import { detectOsAndBrowser } from "@/helpers/analyticsUserAgent";
import { Analytics_batch_max_events, Analytics_queue_overflow_cap } from "@/helpers/analyticsConstants";
import { StrypeSyncTarget } from "@/types/types";

export interface AnalyticsEvent {
    eventId: string;
    eventType: string;
    recordTime: string;
    payload: Record<string, unknown>;
}

export type AnalyticsFlushReason = "interval" | "size_cap" | "critical" | "unload";

/** Session-scoped analytics data (held outside Pinia — not persisted in project state). */
export const analyticsState = {
    countryCode: null as string | null,
    countryName: null as string | null,
    os: "" as string,
    browserName: "" as string,
    browserVersion: null as string | null,
    userId: "" as string,
    sessionStartTime: 0 as number,
    activeSessionTime: 0 as number,
    frameCount: 0 as number,
    sessionId: "" as string,
    platform: "editor" as "editor" | "microbit",
    locale: "" as string,
    eventQueue: [] as AnalyticsEvent[],
    pendingOutputChars: 0 as number,
    flushInProgress: false as boolean,
};

export function initAnalyticsUserId(): void {
    const storageKey = "StrypeAnalyticsUserId";
    let userId = localStorage.getItem(storageKey);
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem(storageKey, userId);
    }
    analyticsState.userId = userId;
}

export function initAnalyticsSession(): void {
    analyticsState.sessionId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `sess-${Date.now()}`;
}

export function initAnalyticsPlatform(): void {
    // #v-ifdef MODE == VITE_MICROBIT_MODE
    analyticsState.platform = "microbit";
    // #v-else
    const path = (typeof window !== "undefined") ? window.location.pathname.toLowerCase() : "";
    analyticsState.platform = path.includes("microbit") ? "microbit" : "editor";
    // #v-endif
}

export function initAnalyticsUserAgent(): void {
    const {os, browserName, browserVersion} = detectOsAndBrowser();
    analyticsState.os = os;
    analyticsState.browserName = browserName;
    analyticsState.browserVersion = browserVersion;
}

export function setAnalyticsCountry(country: UserCountry): void {
    analyticsState.countryCode = country.countryCode;
    analyticsState.countryName = country.countryName;
}

export async function initAnalyticsCountry(): Promise<void> {
    const country = await fetchUserCountry();
    setAnalyticsCountry(country);
}

export function enqueueAnalyticsEvent(eventType: string, payload: Record<string, unknown> = {}): void {
    analyticsState.eventQueue.push({
        eventId: crypto.randomUUID(),
        eventType,
        recordTime: new Date().toISOString(),
        payload,
    });
    if (analyticsState.eventQueue.length >= Analytics_batch_max_events) {
        flushAnalyticsQueue("size_cap");
    }
}

export function flushAnalyticsQueue(reason: AnalyticsFlushReason): void {
    const ingestUrl = import.meta.env.VITE_ANALYTICS_INGEST_URL?.trim();
    if (!ingestUrl) {
        return;
    }
    if (analyticsState.flushInProgress && reason !== "unload") {
        return;
    }

    if (analyticsState.pendingOutputChars > 0) {
        analyticsState.eventQueue.push({
            eventId: crypto.randomUUID(),
            eventType: "output_chunk",
            recordTime: new Date().toISOString(),
            payload: {chars: analyticsState.pendingOutputChars},
        });
        analyticsState.pendingOutputChars = 0;
    }

    if (analyticsState.eventQueue.length === 0) {
        return;
    }

    const batch = analyticsState.eventQueue;
    analyticsState.eventQueue = [];

    const body = JSON.stringify({
        userId: analyticsState.userId,
        sessionId: analyticsState.sessionId,
        platform: analyticsState.platform,
        countryCode: analyticsState.countryCode,
        countryName: analyticsState.countryName,
        os: analyticsState.os,
        browserName: analyticsState.browserName,
        browserVersion: analyticsState.browserVersion,
        flushReason: reason,
        events: batch,
    });
    
    // Skip if not running on strype.org but the ingest server is there:
    if (ingestUrl.includes("strype.org") && !window.location.hostname.includes("strype.org")) {
        return;
    }

    if (reason === "unload" && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(ingestUrl, new Blob([body], {type: "text/plain"}));
        return;
    }

    analyticsState.flushInProgress = true;
    void fetch(ingestUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body,
        mode: "cors",
        keepalive: reason === "unload",
    }).then((res) => {
        if (!res.ok) {
            throw new Error(`ingest returned ${res.status}`);
        }
    }).catch(() => {
        analyticsState.eventQueue = [...batch, ...analyticsState.eventQueue];
        if (analyticsState.eventQueue.length > Analytics_queue_overflow_cap) {
            analyticsState.eventQueue = analyticsState.eventQueue.slice(-Analytics_queue_overflow_cap);
        }
    }).finally(() => {
        analyticsState.flushInProgress = false;
    });
}

export function trackMenuAction(actionId: string): void {
    enqueueAnalyticsEvent("menu_action", {actionId});
}

export function trackInputCall(): void {
    enqueueAnalyticsEvent("input_call");
}

export function trackOutputChars(charCount: number): void {
    analyticsState.pendingOutputChars += charCount;
}

export function initAnalyticsLocale(locale: string): void {
    analyticsState.locale = locale;
}

export function trackAnalyticsLocaleChange(newLocale: string): void {
    const previousLocale = analyticsState.locale;
    if (!previousLocale || previousLocale === newLocale) {
        analyticsState.locale = newLocale;
        return;
    }
    enqueueAnalyticsEvent("locale_change", {from: previousLocale, to: newLocale});
    analyticsState.locale = newLocale;
}

export function trackUsedDemo(demoName: string, source: string): void {
    const cleanDemoName = demoName.trim();
    if (cleanDemoName.length === 0) {
        return;
    }
    enqueueAnalyticsEvent("demo_used", {demoName: cleanDemoName, source});
}

// path is the chapter's path, e.g. "book_vol01/chapter07"; chapter is only its display name (e.g. "Chapter 7"),
// which on its own is ambiguous between volumes. Events from before path was added don't have it.
export function trackUsedBookProject(projectName: string, chapter: string, path: string): void {
    const cleanName = projectName.trim();
    if (cleanName.length === 0) {
        return;
    }
    enqueueAnalyticsEvent("book_project_used", {projectName: cleanName, chapter, path});
}

// How a frame was inserted: an explicit shortcut/command choice -- either "shortcut_key" (a direct
// keyboard shortcut at the bare frame caret, or a letter shortcut typed while the frame commands pane
// is focused -- see insertFrameForShortcutKey, Commands.vue) or "shortcut_mouse" (a genuine mouse
// click on an AddFrameCommand button -- see its own onClick for how Enter-confirm and the "Insert
// frame" context-menu item, which both also end up clicking that same button programmatically, are
// folded into "shortcut_key" instead) -- vs. "typed", organic typing at the bare frame caret (which
// creates an empty func-call frame -- frameType is always "funccall" for this method; its eventual
// real type, if any, shows up separately via trackFrameConvert).
export function trackFrameInsert(frameType: string, method: "shortcut_key" | "shortcut_mouse" | "typed"): void {
    enqueueAnalyticsEvent("frame_insert", {frameType, method});
}

// A func-call frame silently converted to another frame type because its typed content matched a
// recognised keyword (keywordFrameConversions, LabelSlotsStructure.vue) or a variable assignment.
// Virtually always follows a "typed" frame_insert -- a func-call created via its own explicit
// shortcut and then retyped into another keyword is possible but rare enough not to distinguish here.
export function trackFrameConvert(toType: string): void {
    enqueueAnalyticsEvent("frame_convert", {toType});
}

export function trackStorageLocation(target: StrypeSyncTarget): void {
    // For cloud or git saves, cloudProvider says which cloud (so new clouds only need a new case here).
    // storageLocation is kept as the coarse local/cloud split for compatibility with existing data.
    if (target == StrypeSyncTarget.fs) {
        enqueueAnalyticsEvent("save", {storageLocation: "local"});
    }
    else if (target == StrypeSyncTarget.gd) {
        enqueueAnalyticsEvent("save", {storageLocation: "cloud", cloudProvider: "google_drive"});
    }
    else if (target == StrypeSyncTarget.od) {
        enqueueAnalyticsEvent("save", {storageLocation: "cloud", cloudProvider: "onedrive"});
    }
    else if (target == StrypeSyncTarget.gh) {
        enqueueAnalyticsEvent("save", {storageLocation: "cloud", cloudProvider: "github"});
    }
    else if (target == StrypeSyncTarget.gl) {
        enqueueAnalyticsEvent("save", {storageLocation: "cloud", cloudProvider: "gitlab"});
    }
}
