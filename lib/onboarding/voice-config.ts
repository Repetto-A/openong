export type VoiceAvailabilityReason =
  | 'disabled_flag'
  | 'missing_agent_id'
  | 'missing_api_key'
  | 'missing_service_token'
  | 'ready';

export function getVoiceAvailability() {
  const enabledFlag =
    process.env.NEXT_PUBLIC_ONBOARDING_VOICE_ENABLED === 'true';
  const agentId =
    process.env.ELEVENLABS_AGENT_ID ??
    process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const branchId = process.env.ELEVENLABS_BRANCH_ID;
  const serviceToken = process.env.ONBOARDING_AGENT_SERVICE_TOKEN;

  let reason: VoiceAvailabilityReason = 'ready';

  if (!enabledFlag) {
    reason = 'disabled_flag';
  } else if (!agentId) {
    reason = 'missing_agent_id';
  } else if (!apiKey) {
    reason = 'missing_api_key';
  } else if (!serviceToken) {
    reason = 'missing_service_token';
  }

  return {
    enabled: reason === 'ready',
    reason,
    agentId,
    branchId
  };
}
