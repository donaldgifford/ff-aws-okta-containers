// Background entry point. Firefox stops this script when it is idle and
// starts it again for the next event, so every listener must be registered
// synchronously at the top level, on every start.

console.info("[containers] background script loaded");
