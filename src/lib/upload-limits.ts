// Shared by the server and the browser, so a too-big file is refused before it
// is sent. Must stay under serverActions.bodySizeLimit in next.config.ts.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
