/**
 * Model-agnostic representation of binary media (images, files, videos).
 * Each IAgentRunner implementation maps these to provider-specific formats
 * (e.g. Gemini inlineData, OpenAI image_url, Anthropic image blocks).
 */
export interface MediaAttachment {
    readonly type: 'image' | 'file' | 'video';
    readonly data: Buffer;
    readonly mimeType: string;
}
