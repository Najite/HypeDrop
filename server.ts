import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  compareDefindexYields,
  getPortfolioHealth,
  isValidStellarPublicKey,
  runHyperDropAgent,
  simulateRebalanceOrRepay,
  type BlendPosition,
  type CopilotChatRequest,
  type YieldGuardPolicy,
} from './packages/agent-core/src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chatBodySchema = z.object({
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
  policySnapshot: z.custom<YieldGuardPolicy>().optional(),
});

const portfolioBodySchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Invalid Stellar G... public key'),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
  policySnapshot: z.custom<YieldGuardPolicy>().optional(),
  positionsOverride: z.custom<readonly BlendPosition[]>().optional(),
});

const simulateBodySchema = z.object({
  walletAddress: z
    .string()
    .refine(isValidStellarPublicKey, 'Invalid Stellar G... public key'),
  network: z.enum(['TESTNET', 'MAINNET']).default('TESTNET'),
  actionType: z.enum(['repay_debt', 'add_collateral', 'rebalance_vault', 'swap_and_repay']),
  assetCode: z.enum(['USDC', 'XLM', 'EURC']).default('USDC'),
  amount: z.string().min(1),
  targetProtocol: z.enum(['blend', 'defindex', 'soroswap']).default('blend'),
  policySnapshot: z.custom<YieldGuardPolicy>().optional(),
  positionsOverride: z.custom<readonly BlendPosition[]>().optional(),
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/portfolio', async (req, res) => {
    const parsed = portfolioBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid portfolio request', issues: parsed.error.issues });
      return;
    }

    try {
      const [health, yields] = await Promise.all([
        getPortfolioHealth(
          {
            walletAddress: parsed.data.walletAddress,
            network: parsed.data.network,
          },
          {
            policySnapshot: parsed.data.policySnapshot,
            positionsOverride: parsed.data.positionsOverride,
          },
        ),
        compareDefindexYields(
          {
            walletAddress: parsed.data.walletAddress,
            assetCode: 'USDC',
            amount: '1000.00',
            horizonDays: 90,
            network: parsed.data.network,
          },
          {
            policySnapshot: parsed.data.policySnapshot,
          },
        ),
      ]);

      res.json({
        snapshot: health.snapshot,
        policy: health.policy,
        recommendedRepayToSafeUsdc: health.recommendedRepayToSafeUsdc,
        yields,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load Blend portfolio',
      });
    }
  });

  app.post('/api/simulate', async (req, res) => {
    const parsed = simulateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulation request', issues: parsed.error.issues });
      return;
    }

    try {
      const proposal = await simulateRebalanceOrRepay(
        {
          walletAddress: parsed.data.walletAddress,
          network: parsed.data.network,
          actionType: parsed.data.actionType,
          assetCode: parsed.data.assetCode,
          amount: parsed.data.amount,
          targetProtocol: parsed.data.targetProtocol,
        },
        {
          policySnapshot: parsed.data.policySnapshot,
          positionsOverride: parsed.data.positionsOverride,
        },
      );

      res.json(proposal);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Soroban simulation failed',
      });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid chat request', issues: parsed.error.issues });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const requestPayload: CopilotChatRequest = {
      walletAddress: parsed.data.walletAddress,
      network: parsed.data.network,
      messages: parsed.data.messages,
      policySnapshot: parsed.data.policySnapshot,
    };

    try {
      for await (const event of runHyperDropAgent(requestPayload)) {
        res.write(`${JSON.stringify(event)}\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected agent error';
      res.write(`${JSON.stringify({ type: 'error', message, code: 'STREAM_ERROR' })}\n`);
      res.write(`${JSON.stringify({ type: 'done' })}\n`);
    } finally {
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HyperDrop server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
