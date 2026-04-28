interface AgentViewBridge {
  setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  clear(): Promise<void>;
}

interface ElectronBridge {
  agentView: AgentViewBridge;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export {};
