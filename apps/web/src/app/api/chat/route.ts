import { z } from 'zod';
import {
  isValidStellarPublicKey,
  runHyperDropAgent,
  type CopilotChatRequest,
} from '../../../../../../packages/agent-core/src/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatRequestSchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Invalid Stellar G... public key'),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(40),
  policySnapshot: z.any().optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        issues: parsed.error.issues,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const chatRequest: CopilotChatRequest = {
    walletAddress: parsed.data.walletAddress,
    network: parsed.data.network,
    messages: parsed.data.messages,
    policySnapshot: parsed.data.policySnapshot,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runHyperDropAgent(chatRequest)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected agent stream error';
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'error', message, code: 'STREAM_ERROR' })}\n`,
          ),
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done' })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
