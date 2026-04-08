import type { Pinia } from "pinia";
import { useStore } from "@/store/store";

export async function bootstrapApp(pinia: Pinia): Promise<void> {
    const store = useStore(pinia);
    await store.initAnalyticsCountry();
}
