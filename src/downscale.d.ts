declare module "downscale" {
    declare function downscale(
        source: HTMLImageElement | HTMLVideoElement | File | string,
        targetWidth: number,
        targetHeight: number,
        options?: { imageType: "png"; quality?: number }
    ): Promise<HTMLCanvasElement>;

    export = downscale; // CommonJS-style export
}
