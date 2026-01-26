export {}; // required so this augments instead of replaces the module

declare module "vue" {
  import { CompatVue } from "@vue/runtime-dom";
  const Vue: CompatVue;
  export default Vue;
  export * from "@vue/runtime-dom";
  const { configureCompat } = Vue;
  export { configureCompat };
}