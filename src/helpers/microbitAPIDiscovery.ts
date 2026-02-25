/**
 * This helper serves as an API generator on demand.
 * When the API has been generated, we keep it as a constant to be accessed by Strype.
 * It is only regenerated when the language setting changes.
 */

import { APICodedItem, APIItemTextualDescription } from "@/types/types";
import moduleDescription from "@/autocompletion/microbit.json";
import { useI18n } from "vue-i18n";

const APIStuff: APIItemTextualDescription[] | undefined = undefined;

// This methods creates a flat map (array) of the API with the textual content. 
// For localisation, the textual content is separated from the API hierarchical map (i.e. in microbit.json),
// this methods binds the textual content of the API based on the API item keys.
const compileTextualAPI = function(apiCodedItems: APICodedItem[], level?: number, immediateParentName?: string): APIItemTextualDescription[] {
    const apiDocumentedItems = [] as APIItemTextualDescription[];
    apiCodedItems.forEach((apiItem) => {
        // documentation (simple and extra) is not always provided in the json files (for easier readablilty)
        // therefore, we check if the value can be found against the key for doc/extradoc and assign an empty string if not found
        // (we only need the check against the English locale as it is the reference)
        const shortDoc = (useI18n().te("apidiscovery.microbitAPI."+apiItem.name+"_doc","en") ) ? useI18n().t("apidiscovery.microbitAPI."+apiItem.name+"_doc") as string : "";
        const extraDoc = (useI18n().te("apidiscovery.microbitAPI."+apiItem.name+"_extradoc","en")) ? useI18n().t("apidiscovery.microbitAPI."+apiItem.name+"_extradoc") as string : "";

        const apiItemChildren = apiItem.children ?? [] as APICodedItem[]; 
        const version = (apiItem.version) ? apiItem.version : 1;
        apiDocumentedItems.push({name: apiItem.name,
            label: useI18n().t("apidiscovery.microbitAPI."+apiItem.name+"_label") as string,
            doc: shortDoc,
            extradoc: extraDoc,
            version: version,
            level: level??1,
            codePortion: apiItem.codePortion,
            extraCodePortion : apiItem.extraCodePortion??"",
            isFinal: (apiItemChildren.length == 0),
            immediateParentName: (immediateParentName??""), //if the parent's name isn't provided as argument (i.e. for level 1), an empty value is used instead
        });
        // add the children
        apiDocumentedItems.push(...compileTextualAPI(apiItemChildren, (level) ? (level + 1) : 2, apiItem.name));
    }); 
    return apiDocumentedItems;
};

export const getAPIItemTextualDescriptions =  (needToRegenerate: boolean): APIItemTextualDescription[] => {
    if(APIStuff === undefined || needToRegenerate){
        return compileTextualAPI(moduleDescription.api);
    }
    else{
        return APIStuff;
    }
};
