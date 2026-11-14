// Small helpers over the tabs API.

/**
 * @param {Pick<typeof browser.tabs, "get">} tabs
 * @param {number} tabId
 * @returns {Promise<browser.tabs.Tab | null>} Null if the request did not
 *   come from a tab, or the tab is gone.
 */
export async function tabOrNull(tabs, tabId) {
  if (tabId < 0) return null;
  try {
    return await tabs.get(tabId);
  } catch {
    return null;
  }
}

/**
 * Opens an address in a container, next to the tab it came from.
 *
 * @param {Pick<typeof browser.tabs, "create">} tabs
 * @param {string} url
 * @param {string} cookieStoreId
 * @param {browser.tabs.Tab | null} beside
 * @returns {Promise<browser.tabs.Tab>}
 */
export function openBeside(tabs, url, cookieStoreId, beside) {
  /** @type {browser.tabs.CreateProperties} */
  const properties = { url, cookieStoreId };
  if (beside) {
    properties.index = beside.index + 1;
    if (beside.windowId !== undefined) properties.windowId = beside.windowId;
  }
  return tabs.create(properties);
}
