// File: lib/api/client.ts
/**
 * API Client for ThinkMart Fastify backend.
 * 
 * Automatically attaches Firebase ID token to all requests.
 * Provides typed methods for GET, POST, PUT, PATCH, DELETE.
 * Standardizes error handling and response parsing.
 */

import { auth } from '@/lib/firebase/config';

// ─── Configuration ──────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Types ──────────────────────────────────────────────────────────

export interface ApiResponse<T> {
    data: T;
    requestId?: string;
}

export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    requestId?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: unknown;
    public readonly requestId?: string;

    constructor(
        message: string,
        statusCode: number,
        code: string,
        details?: unknown,
        requestId?: string
    ) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.requestId = requestId;
    }
}

// ─── Token Helper ───────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return null;
        return await currentUser.getIdToken();
    } catch {
        return null;
    }
}

// ─── Core Fetch ─────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
    /** Skip authentication (for public endpoints) */
    public?: boolean;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Idempotency key for POST requests */
    idempotencyKey?: string;
    /** AbortSignal for request cancellation */
    signal?: AbortSignal;
}

async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
): Promise<T> {
    const url = `${API_BASE_URL}${path}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Attach Firebase ID token unless explicitly public
    if (!options.public) {
        const token = await getAuthToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    // Add idempotency key for POST requests
    if (options.idempotencyKey) {
        headers['X-Idempotency-Key'] = options.idempotencyKey;
    }

    const fetchOptions: RequestInit = {
        method,
        headers,
        signal: options.signal,
    };

    if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Parse response body
    let responseBody: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
        responseBody = await response.json();
    } else {
        responseBody = await response.text();
    }

    // Handle errors
    if (!response.ok) {
        const errorBody = responseBody as ApiErrorResponse;
        throw new ApiError(
            errorBody?.error?.message || `Request failed with status ${response.status}`,
            response.status,
            errorBody?.error?.code || 'UNKNOWN_ERROR',
            errorBody?.error?.details,
            errorBody?.requestId
        );
    }

    return responseBody as T;
}

// ─── Public API ─────────────────────────────────────────────────────

export const apiClient = {
    /**
     * GET request
     */
    get<T>(path: string, options?: RequestOptions): Promise<T> {
        return request<T>('GET', path, undefined, options);
    },

    /**
     * POST request
     */
    post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
        return request<T>('POST', path, body, options);
    },

    /**
     * PUT request
     */
    put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
        return request<T>('PUT', path, body, options);
    },

    /**
     * PATCH request
     */
    patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
        return request<T>('PATCH', path, body, options);
    },

    /**
     * DELETE request
     */
    delete<T>(path: string, options?: RequestOptions): Promise<T> {
        return request<T>('DELETE', path, undefined, options);
    },
};

export default apiClient;
