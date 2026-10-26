# PS-23: Captions, glossary and spoken scanning

The caption strip observes the shared speech coordinator. It displays the current sentence and remains for four seconds after speech, uses the app text/surface colours, wraps at larger text sizes and moves into open dialogs. Captions are on by default, can be disabled in Accessibility, and are aria-hidden to avoid duplicating speech for screen readers.

Alt+W explains the ringed item, focused item or hovered item, in that order. The independent glossary contains all fifteen story terms. Items without an entry say "No extra help for this item." Detailed voice mode uses the same glossaryHint hook after integration. The former novice Learn page is intentionally absent.

Order review interrupts a briefing and is read again after editing and reviewing again. It falls back to voice mode when switch speech is off. Numeric keypads say "point" for the decimal separator; pad keys do not add redundant selected messages. Fast scanning advances after 700ms and truncates item phrases, while slower speeds and urgent read-backs wait for speech.

Targeted suites cover captions, glossary, switch scanning and edited order read-back. Full tests/build and browser results are recorded in the integration PR. Manual speech intelligibility, physical switch and screen-reader review remain required.

After integration with the current main, limit-order reviews also read the exact per-share limit and enabled take-profit/stop-loss prices. Their validation errors are linked to the relevant fields, which receive focus. Closed-market limit reviews explain that execution depends on reaching the limit.
