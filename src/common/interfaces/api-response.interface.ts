export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  error?: ApiErrorPayload;
  timestamp: string;
  path: string;
}

export interface ApiErrorPayload {
  code: string;
  details?: unknown;
}
