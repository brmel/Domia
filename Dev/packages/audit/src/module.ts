import { resultOk, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, ModuleHost, ModuleResult } from '@domia/contracts';
import { AuditServiceImpl } from './service.js';
import { AuditMetaHandler } from './handler.js';

const AUDIT = moduleId('audit');

/**
 * Auditing is a feature, not a second engine: the service goes to EP.AuditService for
 * CLI/API/UI to read, the belt tools go to EP.MetaTool, and the loop stays unaware.
 */
export function auditModule(): DomiaModule {
  return {
    manifest: { id: AUDIT, version: '0.0.0', provides: [EP.AuditService, EP.MetaTool], requires: [moduleId('trace')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const service = new AuditServiceImpl(host.tracer, host.logger);
      const svcReg = host.register(EP.AuditService, service);
      if (svcReg.isErr()) return svcReg;
      const beltReg = host.register(EP.MetaTool, new AuditMetaHandler(service));
      if (beltReg.isErr()) return beltReg;
      host.logger.info('audit ready', { dimensions: service.dimensions().length });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
