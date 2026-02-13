# ADR: Phase 4 Plugin Capability Gateway Scaffold

## Status
Accepted (Scaffold)

## Decision
Add plugin manifest/capability contracts and policy-gated gateway service.

## Added
- Plugin manifest + capability taxonomy
- `PluginCapabilityPolicyService`
- `PluginGatewayService`

## Controls
- Deny/escalate decisions supported by policy.
- No unrestricted host plugin execution in this phase.
