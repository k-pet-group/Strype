// This file contains the internal mouse+keyboard input API for the Strype graphics world.
// These functions are not directly exposed to users, but are used by graphics.py to
// form the actual public API.

// Temporary fix for using Vue 3 before getting Pyodide changes in (__vue__ is no longer exposed in Vue 3):
// we use vuePEAComponentAPIHandler exposed by our Components API to get access to the PEA component's methods.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
var $builtinmodule = function(name)  {
    var mod = {};
    mod.getAndResetClickedItem = new Sk.builtin.func(function() {
        const all = vuePEAComponentAPIHandler.consumeLastClickedItems();
        for (let i = all.length - 1; i >= 0; i--) {
            let assoc = all[i].associatedObject;
            // We don't have an associatedObject for some PersistentImage, e.g. the say speech bubbles.
            if (assoc) {
                // This already is a Python object so mustn't remap:
                return assoc;
            }
        }
        return Sk.ffi.remapToPy(null);
    });
    mod.getAndResetClickDetails = new Sk.builtin.func(function() {
        const d = vuePEAComponentAPIHandler.consumeLastClickDetails();
        // Should be an array of four numbers so no special mapping consideration needed:
        return Sk.ffi.remapToPy(d);
    });

    mod.getMouseDetails = new Sk.builtin.func(function() {
        const d = vuePEAComponentAPIHandler.getMouseDetails();
        // Should be an array of two numbers and a boolean array so need special mapping consideration:
        return new Sk.builtin.list([Sk.ffi.remapToPy(d[0]), Sk.ffi.remapToPy(d[1]), Sk.ffi.remapToPy(d[2])]);
    });

    mod.getPressedKeys = new Sk.builtin.func(function() {
        return Sk.ffi.remapToPy(vuePEAComponentAPIHandler.getPressedKeys());
    });
    
    mod.checkCollision = new Sk.builtin.func(function(idA, idB) {
        return Sk.ffi.remapToPy(vuePEAComponentAPIHandler.getPersistentImageManager().checkCollision(idA, idB));
    });
    
    mod.getAllTouchingAssociated = new Sk.builtin.func(function(id) {
        // The return value is awkward here because we want to give back a Python list
        // but without converting the objects within, so we don't use remapToPy:
        return new Sk.builtin.list(vuePEAComponentAPIHandler.getPersistentImageManager().getAllOverlapping(id));
    });

    mod.getAllAt = new Sk.builtin.func(function(x, y) {
        // The return value is awkward here because we want to give back a Python list
        // but without converting the objects within, so we don't use remapToPy:
        return new Sk.builtin.list(vuePEAComponentAPIHandler.getPersistentImageManager().calculateAllOverlappingAtPos(x, y).map((p) => p.associatedObject).filter((o) => o != null));
    });

    mod.getAllActors = new Sk.builtin.func(function(id) {
        // The return value is awkward here because we want to give back a Python list
        // but without converting the objects within, so we don't use remapToPy:
        return new Sk.builtin.list(vuePEAComponentAPIHandler.getPersistentImageManager().getAllActors());
    });

    mod.getAllNearbyAssociated = new Sk.builtin.func(function(id, radius) {
        // The return value is awkward here because we want to give back a Python list
        // but without converting the objects within, so we don't use remapToPy:
        return new Sk.builtin.list(vuePEAComponentAPIHandler.getPersistentImageManager().getAllNearby(id, Sk.ffi.remapToJs(radius)));
    });
    
    mod.setCollidable = new Sk.builtin.func(function(id, collidable) {
        vuePEAComponentAPIHandler.getPersistentImageManager().setPersistentImageCollidable(Sk.ffi.remapToJs(id), Sk.ffi.remapToJs(collidable));
    });

    return mod;
};
