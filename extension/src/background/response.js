// Reads a response body through a webRequest stream filter.
//
// The body is handed to the caller once, as text, when the response ends.
// It is never logged here, and the caller must not log it either: for the
// portal's sign-in response it contains a token.

// A sign-in response is a few hundred bytes and an account list a few
// hundred kilobytes. Anything far beyond that is not what was expected.
const MAX_HELD_BYTES = 1024 * 1024;
const MAX_COPIED_BYTES = 8 * 1024 * 1024;

/**
 * @typedef {object} ReadOptions
 * @property {boolean} hold True to keep the body back from the page until
 *   `onComplete` has decided; false to pass it through as it arrives.
 * @property {(body: string) => Promise<boolean>} onComplete Called with the
 *   whole body. When holding, resolve true to keep the body from the page
 *   for good, or false to release it unchanged. A rejection releases it.
 * @property {(error: unknown) => void} onError Called if `onComplete`
 *   rejects.
 */

/**
 * @param {browser.webRequest.StreamFilter} filter
 * @param {ReadOptions} options
 */
export function readResponse(filter, { hold, onComplete, onError }) {
  const decoder = new TextDecoder("utf-8");
  /** @type {ArrayBuffer[]} */
  const held = [];
  let text = "";
  let bytes = 0;
  let abandoned = false;

  filter.ondata = (event) => {
    if (abandoned) {
      filter.write(event.data);
      return;
    }
    bytes += event.data.byteLength;

    if (!hold) {
      filter.write(event.data);
      if (bytes > MAX_COPIED_BYTES) {
        abandoned = true;
        text = "";
        return;
      }
      text += decoder.decode(event.data, { stream: true });
      return;
    }

    held.push(event.data);
    if (bytes > MAX_HELD_BYTES) {
      // Not a sign-in response. Give the page everything and step aside.
      abandoned = true;
      text = "";
      for (const chunk of held.splice(0)) filter.write(chunk);
      filter.disconnect();
      return;
    }
    text += decoder.decode(event.data, { stream: true });
  };

  filter.onstop = () => {
    if (abandoned) {
      filter.close();
      return;
    }
    text += decoder.decode();
    onComplete(text)
      .catch((error) => {
        onError(error);
        return false;
      })
      .then((consumed) => {
        if (hold && !consumed) {
          for (const chunk of held) filter.write(chunk);
        }
        filter.close();
      });
  };

  // The request itself failed; there is nothing to read or release.
  filter.onerror = () => {};
}
