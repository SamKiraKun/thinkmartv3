// File: server/src/routes/users/index.ts
/**
 * User routes.
 * Handles user profile operations in the hybrid auth model.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, verifyFirebaseToken } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { registerUserSchema, updateProfileSchema } from '../../schemas/user.schemas.js';
import * as userService from '../../services/userService.js';
import { NotFoundError } from '../../utils/errors.js';

export async function userRoutes(app: FastifyInstance) {
    /**
     * GET /api/users/me
     * Get the authenticated user's profile from TursoDB.
     */
    app.get(
        '/api/users/me',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const user = await userService.getUserById(request.user!.uid);

            if (!user) {
                throw new NotFoundError('User profile not found');
            }

            return reply.send({ data: user });
        }
    );

    /**
     * POST /api/users/register
     * Create user profile in TursoDB after Firebase Auth signup.
     * Called by frontend immediately after createUserWithEmailAndPassword.
     */
    app.post(
        '/api/users/register',
        {
            preHandler: [
                // We need a custom lighter auth check here since the user
                // won't exist in TursoDB yet (that's what we're creating).
                async (request, reply) => {
                    const authHeader = request.headers.authorization;
                    if (!authHeader || !authHeader.startsWith('Bearer ')) {
                        return reply.status(401).send({
                            error: { code: 'UNAUTHORIZED', message: 'Missing token' },
                        });
                    }

                    try {
                        const token = authHeader.slice(7);
                        const decoded = await verifyFirebaseToken(token);
                        // Attach minimal user info for registration
                        (request as any)._firebaseUid = decoded.uid;
                        (request as any)._firebaseEmail = decoded.email || '';
                    } catch {
                        return reply.status(401).send({
                            error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
                        });
                    }
                },
                validateBody(registerUserSchema),
            ],
        },
        async (request, reply) => {
            const uid = (request as any)._firebaseUid as string;
            const email = (request as any)._firebaseEmail as string;
            const body = request.body as any;

            const user = await userService.registerUser(uid, email, body);

            return reply.status(201).send({ data: user });
        }
    );

    /**
     * PATCH /api/users/:id
     * Update user profile (safe self-update only).
     * Users can only update their own profile.
     */
    app.patch(
        '/api/users/:id',
        {
            preHandler: [requireAuth, validateBody(updateProfileSchema)],
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };

            // Users can only update their own profile
            if (request.user!.uid !== id && request.user!.role !== 'admin') {
                return reply.status(403).send({
                    error: { code: 'FORBIDDEN', message: 'Cannot update other users' },
                });
            }

            const body = request.body as any;
            const user = await userService.updateUserProfile(id, body);

            if (!user) {
                throw new NotFoundError('User not found');
            }

            return reply.send({ data: user });
        }
    );
}
