// This file contains the internal mouse+keyboard input API for the Strype graphics world.
// These functions are not directly exposed to users, but are used by graphics.py to
// form the actual public API.
// It also contains (for ease) the Strype builtins internals.
import { asyncBridge, PyodideWorkerGlobalScope, syncBridge } from "@/workers/python_execution_type";
import { SpriteHandle } from "@/stryperuntime/worker_bridge_type";

declare const globalThis: PyodideWorkerGlobalScope;

export function getAndResetClickedItems() : number[] {
    return syncBridge({request: "consumeLastClickedItems"}).map((h : SpriteHandle) => h.handle);
}
export function getAndResetClickDetails() : number[] | undefined {
    const d = syncBridge({request: "consumeLastClickDetails"});
    if (d == null) {
        return undefined;
    }
    // Flatten it to array for easy return to Python:
    return [d.x, d.y, d.button, d.clickCount];
}

export function getMouseDetails() : [number, number, boolean[]] {
    const d = syncBridge({request: "getMouseDetails"});
    // Should be an array of two numbers and a boolean array:
    return [d.x, d.y, d.buttonsPressed];
}

export function getPressedKeys() : {[key: string]: boolean} {
    return syncBridge({request: "getPressedKeys"});
}

export function waitForNextKey() : string | undefined {
    return syncBridge({request: "waitForNextKey"});
}

export function checkCollision(idA : number, idB : number) : boolean {
    return globalThis.spriteManager.checkCollision(idA, idB);
}

export function getAllTouchingAssociated(id : number) : number[] {
    return globalThis.spriteManager.getAllOverlapping(id);
}

export function getAllAt(x : number, y : number) : number[] {
    return globalThis.spriteManager.calculateAllOverlappingAtPos(x, y).map((p) => p.id);
}

export function getAllActors() : number[] {
    return globalThis.spriteManager.getAllActors();
}

export function getAllNearbyAssociated(id : number, radius : number) : number[] {
    return globalThis.spriteManager.getAllNearby(id, radius);
}

export function setCollidable(id : number, collidable : boolean) : void {
    globalThis.spriteManager.setSpriteCollidable(id, collidable);
}

/**
 * Strype builtins related content.
 * We keep it for now as there are very few elements.
 */

export function clearConsole() : void {
    asyncBridge({request: "console_clear"});
}

export function getCurrentCloudName() : string | undefined {
    return syncBridge({request: "getCurrentCloudName"});
} 
// end Strype builtins