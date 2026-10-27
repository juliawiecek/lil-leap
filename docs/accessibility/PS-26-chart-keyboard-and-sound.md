# PS-26: Chart keyboard and sound

Focus a chart and use Left/Right, Home/End or PageUp/PageDown to inspect recorded points. Inspection freezes the displayed series until Escape or focus leaves. Announcements include time, price, change and matching trades; candle points also include open, high and low. D explains the chart, T toggles its table and Space starts/stops its sound.

Sound uses the displayed series, maps low/high values to low/high pitch and time from left to right, and marks trades with short clicks. Space is an explicit user action, including with reduced motion or live prices paused; those preferences prevent automatic playback. Hidden balances omit amounts and trade markers from alternatives.

The novice sector donut uses matching numbered slice/legend labels in normal and forced colours. Allocation and exposure dialogs distinguish missing market quotes from genuine zero values. Hidden balances mask average cost, the Balances tab and Exposure amounts.

Verification: stock-dashboard-component, chart-keyboard, chart-sonification and portfolio chart suites. Full integration results are recorded in the PR. Listening and NVDA/VoiceOver review remain manual.
