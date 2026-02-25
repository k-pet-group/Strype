/**
 * This helper contains all application wide elements we need widely.
 * The point is to get rid of exported things of main.ts that created circular references.
 */

import { StrypePlatform } from "@/types/types";
import mitt from "mitt";

// As Vue 3 doesn't support $on, $off and $once anymore, we use the mitt package instead for the application event bus
export const eventBus = mitt<Record<string, any>>();

// Version of the application to check code's import compatibility in the editor
// note: that is not an offical software version of Strype, just a way to help us dealing with compatibility issues.
// it MUST be kept as an integer matching value
export const AppVersion = "6";
// The version used in the new .spy file format.  We may increment this in future
// if we introduce a breaking change to that file format.
export const AppSPYSaveVersion = "1";
export const AppName = "Strype";
// The prefix to use in comments directly after the "#" to indicate a Strype
// special directive or metadata:
export const AppSPYPrefix = "(=>";
export const AppSPYFullPrefix = "#" + AppSPYPrefix;
let appPlatform = StrypePlatform.standard;
// #v-ifdef MODE == VITE_MICROBIT_MODE
appPlatform = StrypePlatform.microbit;
// #v-endif
export const AppPlatform = appPlatform;

// The project defintion slot isn't attached to a "real" frame.
// We declare the fake frame ID we used for it here.
export const projectDocumentationFrameId = -10;

let localeBuildDate = "";
export function getLocaleBuildDate(): string {
    // This method returns the build date, set in vite.config.js.
    // To avoid calling the formatter every time, we keep a local
    // variable with the formatted date value for the web session.
    if(localeBuildDate.length > 0) {
        return localeBuildDate;
    }
    else{
        try{
            const buildDateTicks = new Date(__BUILD_DATE_TICKS__);
            localeBuildDate = new Date(buildDateTicks).toLocaleDateString(navigator.language);
            return localeBuildDate;
        }
        catch{
            // Just in case something was wrong in our config file!
            return "N/A";
        }
    }
}