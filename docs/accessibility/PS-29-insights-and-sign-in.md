# PS-29: Insights and sign-in

Both apps use shared/switch-scan.ts and its settings and stylesheet. The first migration commit contains only renames and import changes. App-provided store and speech-format injection tokens keep the engine independent of the trading app; app tsconfigs and JIT test helpers resolve shared Angular code.

A visible Switch control On/Off button is available on both sign-in pages; ?switch=on and Alt+S also start it. Text keypads include letters, digits, punctuation and Caps. Passwords are represented by character counts and never spoken or displayed in the keypad. Listbox options are scanned, including the novice stock picker. Settings toggle names include their visible On/Off state. Insights exposes the same settings and scans the main page groups and dialogs.

Insights chart names describe the series, keyboard point announcements live outside role=img, refresh announcements are throttled, filters announce counts, and table regions are named. Client Detail allocation has the shared Insights chart explanation and table. Show password uses a stable name and aria-pressed in both apps.

Verification: both app suites/builds and mocked browser axe coverage are recorded in the integration PR. Manual screen-reader, real switch-device and team usability checks remain outstanding.
