// agent
export * from './agent/IAgentRuntime';
export * from './agent/IConversationCompactor';
export * from './agent/IPromptService';

// automation
export * from './automation/IAppAutomation';
export * from './automation/IAppDriver';
export * from './automation/IAppDriverFactory';
export * from './automation/IShellPolicy';
export * from './automation/ITabManager';
export * from './automation/IWindowManager';

// perception
export * from './perception/IObservationCoordinator';
export * from './perception/IObservationSampler';
export * from './perception/IObservationStream';
export * from './perception/IPerceptionPipeline';
export * from './perception/IPerceptionSource';
export * from './perception/ISensor';

// persistence
export * from './persistence/ICheckpointRepository';
export * from './persistence/IPersistenceAdapter';
export * from './persistence/IRunRepository';
export * from './persistence/ISkillRepository';
export * from './persistence/IStorageService';
export * from './persistence/IWorkflowRepository';

// reporting
export * from './reporting/IReportGenerator';
export * from './reporting/IRunHealthMonitor';
export * from './reporting/IRunReportWriter';
export * from './reporting/ITraceService';

// plugins
export * from './plugins/IPlugin';
export * from './plugins/IPluginRegistry';
export * from './plugins/ISkillPlayback';

// platform
export * from './platform/IConfigService';
export * from './platform/IEventBus';
export * from './platform/ILogger';
