import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AssistiveTools } from './assistive-tools';
@Component({ selector: 'app-root', imports: [RouterOutlet, AssistiveTools], template: '<router-outlet /><app-assistive-tools />' })
export class AppRoot {}
