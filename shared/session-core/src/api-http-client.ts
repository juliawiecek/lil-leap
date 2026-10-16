import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ApiHttpOptions {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>;
}

/** Shared business transport. Angular's registered interceptor owns authentication. */
@Injectable({ providedIn: 'root' })
export class ApiHttpClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  get<T>(url: string, options?: ApiHttpOptions): Observable<T> {
    return this.http.get<T>(url, options);
  }

  post<T>(url: string, body: unknown, options?: ApiHttpOptions): Observable<T> {
    return this.http.post<T>(url, body, options);
  }
}
