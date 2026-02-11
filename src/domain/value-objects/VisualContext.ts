
export class VisualContext {
    constructor(
        public readonly screenshots: Buffer[],
        public readonly mimeType: string = 'image/jpeg'
    ) { }

    get primaryScreenshot(): Buffer | undefined {
        return this.screenshots.length > 0 ? this.screenshots[0] : undefined;
    }

    get count(): number {
        return this.screenshots.length;
    }
}
