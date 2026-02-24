import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../../db/client.js';

type RealtimeUser = {
    uid: string;
    role: string;
    isActive: boolean;
    isBanned: boolean;
};

// Very lightweight in-memory pubsub for single-node development environments.
// In production, replace with Redis pub/sub or a dedicated realtime broker.
const clients = new Map<string, Set<any>>();

export function broadcast(room: string, topicType: string, payload: unknown) {
    const connections = clients.get(room);
    if (!connections) return;

    for (const conn of connections) {
        if (conn.readyState === 1) {
            conn.send(JSON.stringify({ type: topicType, payload }));
        }
    }
}

function extractBearerToken(req: FastifyRequest): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    const query = req.query as Record<string, unknown> | undefined;
    const token = query?.token;
    return typeof token === 'string' && token.length > 0 ? token : null;
}

async function authenticateRealtimeRequest(req: FastifyRequest): Promise<RealtimeUser | null> {
    const token = extractBearerToken(req);
    if (!token) return null;

    try {
        const decoded = await getAuth().verifyIdToken(token, true);
        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT uid, role, is_active, is_banned FROM users WHERE uid = ?',
            args: [decoded.uid],
        });

        const row = result.rows[0];
        if (!row) return null;

        const user: RealtimeUser = {
            uid: row.uid as string,
            role: (row.role as string) || 'user',
            isActive: Boolean(row.is_active),
            isBanned: Boolean(row.is_banned),
        };

        if (!user.isActive || user.isBanned) {
            return null;
        }

        return user;
    } catch (err) {
        req.log.warn({ err }, 'Realtime auth failed');
        return null;
    }
}

async function canSubscribeToRoom(user: RealtimeUser, room: string): Promise<boolean> {
    if (!room || room.length > 128) return false;

    if (['admin', 'sub_admin'].includes(user.role)) {
        return true;
    }

    if (room === `user:${user.uid}`) {
        return true;
    }

    if (room.startsWith('order:')) {
        const orderId = room.slice('order:'.length);
        if (!orderId) return false;

        if (user.role === 'vendor') {
            // Vendor-level ownership validation is complex with current JSON item modeling.
            // Allowing vendor access keeps existing functionality until vendor-order mapping is normalized.
            return true;
        }

        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT user_id FROM orders WHERE id = ?',
            args: [orderId],
        });

        return result.rows[0]?.user_id === user.uid;
    }

    return false;
}

function addClientToRoom(room: string, socket: any) {
    if (!clients.has(room)) {
        clients.set(room, new Set());
    }
    clients.get(room)!.add(socket);
}

function removeClientFromRoom(room: string, socket: any) {
    const roomClients = clients.get(room);
    if (!roomClients) return;

    roomClients.delete(socket);
    if (roomClients.size === 0) {
        clients.delete(room);
    }
}

export default async function realtimeRoutes(fastify: FastifyInstance) {
    fastify.get('/api/ws/realtime', { websocket: true }, (socket: any, req: FastifyRequest) => {
        void (async () => {
            const user = await authenticateRealtimeRequest(req);
            if (!user) {
                socket.close(1008, 'Unauthorized');
                return;
            }

            const activeRooms = new Set<string>();

            socket.on('message', (message: string) => {
                void (async () => {
                    try {
                        const data = JSON.parse(message.toString());

                        if (data.type === 'subscribe' && Array.isArray(data.payload?.rooms)) {
                            for (const room of data.payload.rooms) {
                                if (typeof room !== 'string') continue;

                                const allowed = await canSubscribeToRoom(user, room);
                                if (!allowed) {
                                    socket.send(JSON.stringify({
                                        type: 'error',
                                        payload: { code: 'FORBIDDEN_ROOM', room },
                                    }));
                                    continue;
                                }

                                addClientToRoom(room, socket);
                                activeRooms.add(room);
                            }
                        }

                        if (data.type === 'unsubscribe' && Array.isArray(data.payload?.rooms)) {
                            for (const room of data.payload.rooms) {
                                if (typeof room !== 'string') continue;
                                removeClientFromRoom(room, socket);
                                activeRooms.delete(room);
                            }
                        }
                    } catch {
                        req.log.warn('Invalid websocket message received');
                    }
                })();
            });

            socket.on('close', () => {
                for (const room of activeRooms) {
                    removeClientFromRoom(room, socket);
                }
            });
        })();
    });
}
