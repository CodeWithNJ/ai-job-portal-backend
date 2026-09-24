import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiErrorPayload,
  ApiResponse,
} from '../interfaces/api-response.interface';

interface HttpExceptionResponseShape {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.normalizeException(exception);

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      // Log the real cause server-side; the client only ever sees `message`.
      const cause =
        exception instanceof Error && !(exception instanceof HttpException)
          ? exception.message
          : message;
      this.logger.error(
        `[${request.method}] ${request.url} -> ${statusCode} ${cause}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} -> ${statusCode} ${message}`,
      );
    }

    const body: ApiResponse<null> = {
      success: false,
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    message: string;
    error: ApiErrorPayload;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        return {
          statusCode,
          message: responseBody,
          error: { code: this.codeFromStatus(statusCode) },
        };
      }

      const shape = responseBody as HttpExceptionResponseShape;
      const rawMessage = shape.message ?? exception.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage[0]
        : (rawMessage ?? 'Request failed');

      return {
        statusCode,
        message,
        error: {
          code: shape.error
            ? this.toCode(shape.error)
            : this.codeFromStatus(statusCode),
          details: Array.isArray(shape.message) ? shape.message : undefined,
        },
      };
    }

    // Anything that isn't an HttpException is unexpected (Prisma, driver,
    // programming errors). Its message can leak queries, table names or
    // stack details, so the client gets a fixed string instead.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: {
        code: 'INTERNAL_SERVER_ERROR',
      },
    };
  }

  private codeFromStatus(status: number): string {
    const entry = Object.entries(HttpStatus).find(
      ([, value]) => Number(value) === status,
    );
    return entry?.[0] ?? 'ERROR';
  }

  private toCode(input: string): string {
    return input
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }
}
