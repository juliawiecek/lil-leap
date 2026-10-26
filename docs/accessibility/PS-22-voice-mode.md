# PS-22: Voice mode

Voice mode is off by default and uses one aria-pressed button on both apps. Turning it on says "Voice mode on." Brief reads the label and value; Detailed adds roles, states and a glossary hint where available. Passwords and sensitive values are excluded. Focus is debounced; hover waits for intent; live prices do not continuously narrate changes.

Voice and briefing share speed. Escape stops reading. Passive focus speech yields to other channels; explicit reading and urgent trade outcomes can interrupt. Sound cues are separately opt-in and do not add accessibility-tree content.

Verification: voice-mode.test.mjs covers persistence, shared speed, levels, privacy, repeated phrases and priority. Full integration validation is recorded in the PR. Manual local-voice and screen-reader review remains required.
