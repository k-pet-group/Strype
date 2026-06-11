import { settingsStore } from "@/store/store";
import { onAnalyticsPageUnload, startSessionTracking } from "@/helpers/sessionTracker";
import { Analytics_batch_flush_ms } from "@/helpers/analyticsConstants";
import { AutoSaveKeyNames } from "@/helpers/editor";
import i18n from "@/i18n";
import {
    enqueueAnalyticsEvent,
    flushAnalyticsQueue,
    initAnalyticsCountry,
    initAnalyticsLocale,
    initAnalyticsPlatform,
    initAnalyticsSession,
    initAnalyticsUserId,
    trackAnalyticsLocaleChange,
} from "@/store/analytics";

export function initialiseAnalytics(): void {
    initAnalyticsUserId();
    initAnalyticsSession();
    initAnalyticsPlatform();
    startSessionTracking();
    void initAnalyticsCountry();

    // The app applies the user's locale later (during App startup), after analytics has
    // initialised, so analyticsState.locale isn't populated yet. To give session_start the
    // real locale, seed it now from the same persisted setting the app restores from,
    // falling back to the active i18n locale (the build default) for first-time users.
    const savedSettings = JSON.parse(localStorage.getItem(AutoSaveKeyNames.settingsState) ?? "{}");
    const initialLocale = (typeof savedSettings.locale === "string" && savedSettings.locale.length > 0)
        ? savedSettings.locale
        : i18n.global.locale.value;
    initAnalyticsLocale(initialLocale);

    settingsStore().$subscribe((_mutation, state) => {
        if (typeof state.locale === "string" && state.locale.length > 0) {
            trackAnalyticsLocaleChange(state.locale);
        }
    });

    enqueueAnalyticsEvent("session_start", {locale: initialLocale});

    setInterval(() => flushAnalyticsQueue("interval"), Analytics_batch_flush_ms);

    window.addEventListener("beforeunload", onAnalyticsPageUnload);
    window.addEventListener("pagehide", onAnalyticsPageUnload);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            onAnalyticsPageUnload();
        }
    });
}
