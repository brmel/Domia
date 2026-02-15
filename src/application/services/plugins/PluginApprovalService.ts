import { injectable } from 'tsyringe';
import type { PluginInvocationRequest } from '@domain/plugins/PluginManifest';

@injectable()
export class PluginApprovalService {
    isApproved(request: PluginInvocationRequest): boolean {
        const approvedFlag = request.payload['approved'];
        const approvalToken = request.payload['approvalToken'];

        if (approvedFlag === true) {
            return true;
        }

        return typeof approvalToken === 'string' && approvalToken === 'approved';
    }
}
