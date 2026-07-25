export const STABLE_PROTOCOL_VERSION = '2025-11-25';
export const TARGET_PROTOCOL_VERSION = '2026-07-28';

export interface ProtocolReadiness {
  stable: typeof STABLE_PROTOCOL_VERSION;
  target: typeof TARGET_PROTOCOL_VERSION;
  target_status: 'experimental';
}

/**
 * Report the protocol contract exposed by the current production entrypoint.
 *
 * The 2026 revision remains experimental until the TypeScript SDK v2 migration
 * and official conformance suite both pass. Reporting it separately prevents
 * clients and operators from mistaking migration work for wire compatibility.
 */
export function getProtocolReadiness(): ProtocolReadiness {
  return {
    stable: STABLE_PROTOCOL_VERSION,
    target: TARGET_PROTOCOL_VERSION,
    target_status: 'experimental',
  };
}
