import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** Adapt Angular's intercepted transport to the existing service-layer fetch contract. */
export function angularTransport(http: HttpClient): typeof fetch {
  return async (input, init = {}) => {
    if (typeof input !== 'string') throw new TypeError('API transport requires a URL string.');
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    try {
      const result = await firstValueFrom(http.request(init.method ?? 'GET', input, {
        body: init.body, headers, observe: 'response', responseType: 'text',
      }));
      return new Response(result.status === 204 ? null : result.body, { status: result.status });
    } catch (error) {
      if (!(error instanceof HttpErrorResponse) || error.status === 0) throw error;
      const body = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
      return new Response(body, { status: error.status });
    }
  };
}
