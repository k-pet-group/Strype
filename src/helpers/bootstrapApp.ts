import type { Pinia } from "pinia";
import { useStore } from "@/store/store";
import { startSessionTracking } from "@/helpers/sessionTracker";

export async function bootstrapApp(pinia: Pinia): Promise<void> {
    const store = useStore(pinia);
    store.initAnalyticsUserId();
    startSessionTracking(store);
    await store.initAnalyticsCountry();
}
