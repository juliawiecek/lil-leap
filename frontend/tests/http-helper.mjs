import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { defer } from 'rxjs';

/** Adapt legacy response fixtures to the shared transport contract, without auth policy. */
export function apiHttp(fetchImpl) {
  const request = (method, url, body) => defer(async () => {
    const response = await fetchImpl(url, {
      method, headers: {}, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      throw new HttpErrorResponse({ status: response.status, error: value, url });
    }
    return value;
  });
  return {
    get: url => request('GET', url),
    post: (url, body) => request('POST', url, body),
  };
}
