import { NextRequest, NextResponse } from 'next/server';
import { getVoiceAvailability } from '@/lib/onboarding/voice-config';

export async function POST(_request: NextRequest) {
  const voice = getVoiceAvailability();
  const agentId = voice.agentId;
  const branchId = voice.branchId;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!voice.enabled || !agentId || !apiKey) {
    return NextResponse.json(
      {
        enabled: false,
        reason: voice.reason
      },
      { status: 200 }
    );
  }

  const url = new URL(
    'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url'
  );
  url.searchParams.set('agent_id', agentId);
  if (branchId) {
    url.searchParams.set('branch_id', branchId);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        enabled: false,
        reason: 'upstream_error',
        status: response.status
      },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as { signed_url: string };

  return NextResponse.json({
    enabled: true,
    mode: 'signed_url',
    signedUrl: payload.signed_url,
    agentId,
    branchId
  });
}
