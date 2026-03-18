import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config.js';

const connection = { url: config.redisUrl };

/** Queue for turn deadline jobs. Each job = one turn that needs auto-resolving. */
export const turnQueue = new Queue('turn-deadlines', { connection });

interface TurnJobData {
  gameId: string;
  turnNumber: number;
}

/**
 * Schedule a turn deadline.
 * @param gameId - The game to resolve
 * @param turnNumber - Which turn this deadline is for
 * @param delayMs - Milliseconds until auto-resolution
 * @returns The BullMQ job ID (used to cancel on early submit)
 */
export async function scheduleTurnDeadline(
  gameId: string,
  turnNumber: number,
  delayMs: number,
): Promise<string> {
  const jobId = `turn:${gameId}:${turnNumber}`;

  // Remove any existing job for this game/turn
  const existing = await turnQueue.getJob(jobId);
  if (existing) await existing.remove();

  const job = await turnQueue.add(
    'resolve-turn',
    { gameId, turnNumber } satisfies TurnJobData,
    { jobId, delay: delayMs, removeOnComplete: true, removeOnFail: 100 },
  );

  return job.id!;
}

/** Cancel a scheduled turn deadline (e.g. when all players submit early). */
export async function cancelTurnDeadline(gameId: string, turnNumber: number): Promise<void> {
  const jobId = `turn:${gameId}:${turnNumber}`;
  const job = await turnQueue.getJob(jobId);
  if (job) await job.remove();
}

/** Get remaining time (ms) for a scheduled turn deadline. Returns 0 if not found. */
export async function getRemainingTime(gameId: string, turnNumber: number): Promise<number> {
  const jobId = `turn:${gameId}:${turnNumber}`;
  const job = await turnQueue.getJob(jobId);
  if (!job) return 0;

  const delay = await job.getState();
  if (delay === 'delayed') {
    const processedOn = job.processedOn;
    const timestamp = job.timestamp;
    const jobDelay = job.delay ?? 0;
    const fireAt = timestamp + jobDelay;
    return Math.max(0, fireAt - Date.now());
  }
  return 0;
}

/** Duration constants for game modes. */
export const TURN_DURATIONS = {
  blitz: 5 * 60 * 1000,       // 5 minutes
  standard: 24 * 60 * 60 * 1000, // 24 hours
  anytime: 0,                   // no timer
} as const;

/**
 * Start the BullMQ worker that processes turn deadlines.
 * The handler is injected to avoid circular dependencies.
 */
export function startTurnWorker(
  handler: (gameId: string, turnNumber: number) => Promise<void>,
): Worker {
  const worker = new Worker<TurnJobData>(
    'turn-deadlines',
    async (job: Job<TurnJobData>) => {
      console.log(`Turn deadline fired: game=${job.data.gameId} turn=${job.data.turnNumber}`);
      await handler(job.data.gameId, job.data.turnNumber);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`Turn job failed: ${job?.id}`, err);
  });

  return worker;
}
