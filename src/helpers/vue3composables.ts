import { Ref, ref, UnwrapRef, watchEffect } from "vue";

export function useAsyncComputed<T>(getter: () => Promise<T>, defaultValue: T): Ref<any, any> | Ref<T, T> | Ref<UnwrapRef<T>, T | UnwrapRef<T>> {
    const value = ref(defaultValue);

    watchEffect(async () => {
        value.value = await getter();
    });

    return value;
}