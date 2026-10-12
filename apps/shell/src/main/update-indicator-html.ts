export const UPDATE_INDICATOR_WIDTH = 34;
export const UPDATE_INDICATOR_HEIGHT = 34;

/** Render the isolated update control without platform-native button styling. */
export function renderUpdateIndicatorHtml(label: string): string {
  const safeLabel = label
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
/* This page has no shell reset stylesheet and its viewport matches the button. */
button{-webkit-appearance:none;appearance:none;display:grid;place-items:center;flex:none;
  width:34px;height:34px;margin:0;padding:0;border:0;border-radius:50%;
  background:rgb(65,118,230);color:#fff;cursor:pointer;transition:background-color 100ms ease}
button:hover:not(:disabled){background:rgb(103,158,254)}
button:disabled{opacity:.4;cursor:default}
@media (prefers-color-scheme:dark){
  button{background:rgb(103,158,254)}
  button:hover:not(:disabled){background:rgb(65,118,230)}
}
</style></head><body><button type="button" aria-label="${safeLabel}" title="${safeLabel}" onclick="window.location.href='freecode://updates/open'">
<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path transform="rotate(180 8 8)" d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" /></svg>
</button></body></html>`;
}
