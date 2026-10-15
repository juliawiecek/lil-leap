import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppRoot } from './app/app-root';
import { startApplication } from './app/security';

void startApplication(() => bootstrapApplication(AppRoot, appConfig));
