export interface AgentViewAPI {
    resize: (bounds: { x: number; y: number; width: number; height: number }) => void;
    show: (bounds: { x: number; y: number; width: number; height: number }) => void;
    hide: () => void;
    navigateTo: (url: string) => void;
}

declare global {
    interface Window {
        electron: {
            agentView: AgentViewAPI;
        };
    }
}
