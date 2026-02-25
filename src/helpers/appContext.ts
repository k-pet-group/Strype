/**
 * This helper contains all application wide elements we need widely.
 * The point is to get rid of exported things of main.ts that created circular references.
 */

import mitt from "mitt";

// As Vue 3 doesn't support $on, $off and $once anymore, we use the mitt package instead for the application event bus
export const eventBus = mitt<Record<string, any>>();
