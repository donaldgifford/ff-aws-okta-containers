// Hand-written declarations for the WebExtension APIs this extension calls.
//
// There is no package.json in this repository, so the community type
// package is not used. Only the calls the extension makes are declared; a
// call with no declaration here fails type checking, which is the point.
// Each namespace links to the MDN page it was written from.

declare namespace browser {
  /** An event with plain listeners. */
  interface WebExtEvent<Listener extends (...args: never[]) => unknown> {
    addListener(listener: Listener): void;
    removeListener(listener: Listener): void;
    hasListener(listener: Listener): boolean;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/contextualIdentities */
  namespace contextualIdentities {
    interface ContextualIdentity {
      cookieStoreId: string;
      name: string;
      color: string;
      colorCode: string;
      icon: string;
      iconUrl: string;
    }
    interface Details {
      name: string;
      color: string;
      icon: string;
    }
    function query(details: { name?: string }): Promise<ContextualIdentity[]>;
    function get(cookieStoreId: string): Promise<ContextualIdentity>;
    function create(details: Details): Promise<ContextualIdentity>;
    function update(cookieStoreId: string, details: Partial<Details>): Promise<ContextualIdentity>;
    function remove(cookieStoreId: string): Promise<ContextualIdentity>;
    const onRemoved: WebExtEvent<(changeInfo: { contextualIdentity: ContextualIdentity }) => void>;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs */
  namespace tabs {
    interface Tab {
      id?: number;
      index: number;
      windowId?: number;
      url?: string;
      active: boolean;
      incognito: boolean;
      cookieStoreId?: string;
    }
    interface CreateProperties {
      url?: string;
      cookieStoreId?: string;
      index?: number;
      windowId?: number;
      active?: boolean;
    }
    function get(tabId: number): Promise<Tab>;
    function create(properties: CreateProperties): Promise<Tab>;
    function remove(tabId: number | number[]): Promise<void>;
    function query(queryInfo: { cookieStoreId?: string; active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    const onUpdated: WebExtEvent<(tabId: number, changeInfo: { url?: string; status?: string }, tab: Tab) => void>;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/storage */
  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }
    const local: StorageArea;
    const onChanged: WebExtEvent<(changes: Record<string, StorageChange>, areaName: string) => void>;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/webRequest */
  namespace webRequest {
    type ResourceType = "main_frame" | "sub_frame" | "xmlhttprequest" | "other";
    interface RequestFilter {
      urls: string[];
      types?: ResourceType[];
    }
    interface RequestDetails {
      requestId: string;
      url: string;
      method: string;
      type: string;
      tabId: number;
      originUrl?: string;
      documentUrl?: string;
      cookieStoreId?: string;
      incognito?: boolean;
    }
    interface BlockingResponse {
      cancel?: boolean;
    }
    /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/StreamFilter */
    interface StreamFilter {
      ondata: ((event: { data: ArrayBuffer }) => void) | null;
      onstop: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      error: string;
      write(data: ArrayBuffer | Uint8Array): void;
      close(): void;
      disconnect(): void;
    }
    type BeforeRequestListener = (
      details: RequestDetails,
    ) => BlockingResponse | Promise<BlockingResponse> | undefined;
    interface BeforeRequestEvent {
      addListener(listener: BeforeRequestListener, filter: RequestFilter, extraInfoSpec?: "blocking"[]): void;
      removeListener(listener: BeforeRequestListener): void;
      hasListener(listener: BeforeRequestListener): boolean;
    }
    const onBeforeRequest: BeforeRequestEvent;
    function filterResponseData(requestId: string): StreamFilter;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/permissions */
  namespace permissions {
    interface Permissions {
      origins?: string[];
      permissions?: string[];
    }
    function request(permissions: Permissions): Promise<boolean>;
    function remove(permissions: Permissions): Promise<boolean>;
    function contains(permissions: Permissions): Promise<boolean>;
    function getAll(): Promise<Permissions>;
    const onAdded: WebExtEvent<(permissions: Permissions) => void>;
    const onRemoved: WebExtEvent<(permissions: Permissions) => void>;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/action */
  namespace action {
    const onClicked: WebExtEvent<(tab: tabs.Tab) => void>;
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    function setTitle(details: { title: string | null }): Promise<void>;
  }

  /** https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime */
  namespace runtime {
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
  }
}
