import type { useStore } from "@/store/store";

const TICK_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_THRESHOLD_MS = 5 * 60_000; // 5 minutes

export function startSessionTracking(store: ReturnType<typeof useStore>): void {
    let lastActivityTime = Date.now();
    let lastTickTime = Date.now();

    store.analyticsSessionStartTime = Date.now();
    store.analyticsActiveSessionTime = 0;

    const onActivity = () => {
        lastActivityTime = Date.now();
    };

    document.addEventListener("mousemove", onActivity, { passive: true });
    document.addEventListener("keydown", onActivity, { passive: true });
    document.addEventListener("click", onActivity, { passive: true });
    document.addEventListener("scroll", onActivity, { passive: true });

    const tick = () => {
        const now = Date.now();
        if (now - lastActivityTime < IDLE_THRESHOLD_MS) {
            store.analyticsActiveSessionTime += now - lastTickTime;
        }
        lastTickTime = now;
    };

    setInterval(tick, TICK_INTERVAL_MS);

    window.addEventListener("beforeunload", () => {
        tick();
        store.analyticsFrameCount = Object.values(store.frameObjects).filter((f) => f.id > 0).length;
        console.log("Session active time:", Math.round(store.analyticsActiveSessionTime / 1000), "seconds");
        console.log("Frame count:", store.analyticsFrameCount);
    });
}
