export interface HttpRequest {
  method: string;
  body: string | null;
  correlationId: string;
  sourceIp?: string;
}

export interface HttpResponse {
  statusCode: number;
  body: string;
}
