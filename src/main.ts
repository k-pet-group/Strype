import App from "@/App.vue";
import i18n from "@/i18n";
import { BootstrapVue } from "bootstrap-vue";
import "bootstrap-vue/dist/bootstrap-vue.css";
import "bootstrap/dist/css/bootstrap.css";
import { createPinia, PiniaVuePlugin } from "pinia";
import vBlur from "v-blur";
import Vue from "vue";
import { StrypePlatform } from "./types/types";

Vue.config.productionTip = false;

// Version of the application to check code's import compatibility in the editor
// note: that is not an offical software version of Strype, just a way to help us dealing with compatibility issues.
// it MUST be kept as an integer matching value
export const AppVersion = "5";
let appPlatform = StrypePlatform.standard;
/* IFTRUE_isMicrobit */
appPlatform = StrypePlatform.microbit;
/* FITRUE_isMicrobit */
export const AppPlatform = appPlatform;

// Install BootstrapVue
Vue.use(BootstrapVue);

// Use v-blur
Vue.use(vBlur);

// Use a Pinia store (instead of Vuex store, because it handles type inferrence better)
Vue.use(PiniaVuePlugin);
const pinia = createPinia();
Vue.config.productionTip = false;

export const vm = new Vue({
    pinia,
    i18n,
    render: (h) => h(App),
});
vm.$mount("#app");
