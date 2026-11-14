// Small helpers for building the options page without a framework and
// without ever turning a string into markup.

/**
 * Creates an element. Text is always added as text nodes.
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string | boolean>} [attributes] `true` sets a
 *   boolean attribute; `false` leaves it off.
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === true) node.setAttribute(name, "");
    else if (value !== false) node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

/**
 * Finds an element the page's HTML is known to contain.
 *
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
export function byId(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) {
    throw new Error(`The options page is missing #${id}`);
  }
  return found;
}

/**
 * Shows a message in a status line, or clears it.
 *
 * @param {HTMLElement} line
 * @param {string} message
 * @param {"info" | "error"} [tone]
 */
export function setStatus(line, message, tone = "info") {
  line.textContent = message;
  line.classList.toggle("error", tone === "error" && message !== "");
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
