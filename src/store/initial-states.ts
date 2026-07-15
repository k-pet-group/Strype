import { StateAppObjects }  from "@/types/types";
import emptyState from "@/store/initial-states/empty-state";
import initialPythonState from "@/store/initial-states/initial-python-state";
import initialMicrobitState from "@/store/initial-states/initial-microbit-state";

const initialStates: StateAppObjects = {
    
    "initialEmptyState": {
        debugging: false,
        initialState: emptyState,
        showKeystroke: false,
        nextAvailableId: 1,
    },

    "initialPythonState": {
        debugging: false,
        initialState: initialPythonState,
        showKeystroke: false,
        nextAvailableId: 5,
    },

    "initialMicrobitState": {
        debugging: false,
        initialState: initialMicrobitState,
        showKeystroke: false,
        nextAvailableId: 4,
    },


};

export default initialStates;


