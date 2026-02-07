export interface ViewOptions {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface IViewHost {
    show(options: ViewOptions): Promise<void>;
    hide(): Promise<void>;
    getCDPWebSocketURL(): Promise<string>;
}
