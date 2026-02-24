// File: server/src/utils/errors.ts
/**
 * Standardized API error classes.
 * These map to HTTP status codes and provide consistent error responses.
 */

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: unknown;

    constructor(
        message: string,
        statusCode: number,
        code: string,
        details?: unknown
    ) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export class BadRequestError extends AppError {
    constructor(message = 'Bad request', details?: unknown) {
        super(message, 400, 'BAD_REQUEST', details);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Resource conflict') {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}

export class TooManyRequestsError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'TOO_MANY_REQUESTS');
        this.name = 'TooManyRequestsError';
    }
}

export class InternalError extends AppError {
    constructor(message = 'Internal server error') {
        super(message, 500, 'INTERNAL_ERROR');
        this.name = 'InternalError';
    }
}

/**
 * Standard API error response shape.
 */
export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
    requestId?: string;
}
