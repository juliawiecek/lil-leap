# PS-22: Voice mode

Voice mode is off by default and uses one aria-pressed button on both apps. Turning it on says "Voice mode on." Brief reads the label and value; Detailed adds roles, states and a glossary hint where available. Passwords and sensitive values are excluded. Focus is debounced; hover waits for intent; live prices do not continuously narrate changes.

Voice and briefing share speed. Alt+Shift+X stops reading. Escape returns to the containing group or performs its native dialog/popup action. Passive focus speech yields to other channels; explicit reading and urgent trade outcomes can interrupt. Sound cues are separately opt-in and do not add accessibility-tree content.

Alt+Shift+V toggles voice mode on every page in both apps, including sign-in and while editing a field.
Arrow-key navigation has its own setting, independent of voice mode, and Alt+Shift+N toggles it.
Settings has one Arrow-key navigation toggle: turning it on enables navigation, stops switch scanning if active,
focuses the current page or modal heading, and shows the instructions (also spoken when voice is on). This gives a known
starting point even when the person was focused on a settings field or menu.
With arrow-key navigation on, Up/Down moves to elements above/below and Left/Right moves to elements on either
side, using current rendered bounding boxes. Movement prefers elements aligned with the requested
direction and never wraps. Missing neighbors are announced without scrolling. Arrow reading works
even when Speak on keyboard focus is off. Text, headings, metrics and controls participate;
hidden/inert content and disabled controls are skipped. Navigation stays inside an open modal.

Named panels, navigation regions, settings fieldsets and data-scan-group containers are group stops.
Enter enters a focused group and announces its name; Escape returns to its container one level at a
time. Only siblings at the current level participate in arrow movement. Enter on a leaf button/link
retains native activation. Held Enter after entering a group cannot accidentally activate its first
control. Escape closes an expanded menu before leaving its group; outside groups, native dialog
closing is unchanged. Temporary tabindex and focus highlighting are removed after focus leaves.

Fields, editable content, tabs, menus, sliders and focusable charts retain their arrows. Use Tab or
Shift+Tab to leave these widgets, or Escape to return to their containing group. Modified arrows, screen-reader commands, and switch-control scanning
are left alone. Turning arrow-key navigation off restores ordinary page arrows. Voice can be turned
off while navigation remains enabled, and navigation works without a speech API or installed voice.
Turning voice on does not turn navigation on. Older saved voice-enabled preferences migrate to
navigation enabled once, preserving existing behavior; explicit choices are then saved separately.
Browser speech requires a local voice;
the existing readable status explains when no local voice is available.

Verification: voice-mode.test.mjs covers persistence, shared speed, levels, privacy, repeated phrases and priority. Full integration validation is recorded in the PR. Manual local-voice and screen-reader review remains required.
