import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { startApplication } from './app/security';

void startApplication(() => bootstrapApplication(App, appConfig));
