interface RegisteredTool {
    readonly name: string;
}

export interface IPluginRegistry {
    getAllTools(): RegisteredTool[];
}
