export interface HttpRequest {
  method: string;
  body: string | null;
  correlationId: string;
}

export interface HttpResponse {
  statusCode: number;
  body: string;
}
