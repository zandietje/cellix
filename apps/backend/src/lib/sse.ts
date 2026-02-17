import type { FastifyReply } from 'fastify';

export function setSseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

export function writeSseEvent(reply: FastifyReply, event: unknown): boolean {
  try {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_STREAM_DESTROYED') {
      throw error;
    }
    return false; // Client disconnected
  }
}
