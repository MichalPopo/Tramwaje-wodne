import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode: number;
    isOperational: boolean;
}

export function createAppError(message: string, statusCode: number): AppError {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
}

export function errorHandler(
    err: Error | AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const statusCode = 'statusCode' in err ? err.statusCode : 500;
    const message = 'isOperational' in err && err.isOperational
        ? err.message
        : 'Wewnętrzny błąd serwera';

    console.error(`[ERROR] ${statusCode}: ${err.message}`);
    if (statusCode === 500) {
        console.error(err.stack);
    }

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && statusCode === 500
            ? { stack: err.stack }
            : {}),
    });
}
