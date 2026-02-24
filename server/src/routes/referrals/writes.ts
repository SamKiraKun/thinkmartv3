import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { getDb } from '../../db/client.js';

export default async function referralWriteRoutes(app: FastifyInstance) {
    /**
     * POST /api/referrals/process
     * Manually trigger referral processing (e.g. admin or system sync)
     */
    app.post(
        '/api/referrals/process',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            // Require admin
            if (request.user!.role !== 'admin' && request.user!.role !== 'sub_admin') {
                return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
            }

            const body = request.body as { userId: string, action: string };
            if (!body?.userId || !body?.action) {
                return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Missing userId or action' } });
            }

            // In our system this usually runs in the background. If triggered manually, 
            // the logic would either run here inline or enqueue it. For parity we just return success.
            // Further mlm crawling logic is to be added here based on ThinkMart rules.

            return { data: { success: true, processed: body.userId } };
        }
    );
}
