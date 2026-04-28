export interface MediaAttachment {
    readonly type: 'image' | 'file' | 'video';
    readonly data: Buffer;
    readonly mimeType: string;
}
