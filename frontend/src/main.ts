import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { startSecureApplication } from './app/security';

void startSecureApplication(window.location.protocol, () => bootstrapApplication(App, appConfig), () => {
  const root = document.querySelector('app-root');
  if (root) root.textContent = 'A secure HTTPS connection is required. Open this site using https://.';
});
