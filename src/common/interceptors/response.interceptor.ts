import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

interface ControllerPayload<T> {
  message?: string;
  data?: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const decoratorMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((payload: T | ControllerPayload<T>): ApiResponse<T> => {
        const { message, data } = this.extractMessageAndData(
          payload,
          decoratorMessage,
        );

        return {
          success: true,
          statusCode: response.statusCode,
          message,
          data,
          timestamp: new Date().toISOString(),
          path: request.url,
        };
      }),
    );
  }

  private extractMessageAndData(
    payload: T | ControllerPayload<T>,
    decoratorMessage?: string,
  ): { message: string; data: T | undefined } {
    const fallback = decoratorMessage ?? 'Request processed successfully';

    if (
      payload !== null &&
      typeof payload === 'object' &&
      'data' in payload &&
      Object.keys(payload).every((key) => ['message', 'data'].includes(key))
    ) {
      const typed = payload;
      return {
        message: typed.message ?? fallback,
        data: typed.data,
      };
    }

    return { message: fallback, data: payload as T };
  }
}
