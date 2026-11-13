// The Backup section of the options page: export the settings to a file,
// and import them back.

/** @import { Registry } from "../background/registry.js" */
/** @import { Store } from "../storage/store.js" */

import { refreshAccess } from "../background/access.js";
import { REGIONS } from "../core/regions.js";
import {
  applyImport,
  exportSettings,
  IMPORT_FAILURES,
  parseImport,
} from "../storage/backup.js";
import { byId, errorMessage, h, setStatus } from "./dom.js";

const MAX_IMPORT_BYTES = 1024 * 1024;

/**
 * @param {object} dependencies
 * @param {Store} dependencies.store
 * @param {Registry} dependencies.registry
 * @returns {{ render: () => void }}
 */
export function createBackupSection({ store, registry }) {
  const exportButton = byId("backup-export", HTMLButtonElement);
  const importInput = byId("backup-import", HTMLInputElement);
  const status = byId("backup-status", HTMLElement);

  /**
   * @param {() => Promise<string>} action Resolves with what to tell the user.
   */
  function run(action) {
    setStatus(status, "Working…");
    action().then(
      (message) => setStatus(status, message),
      (error) => setStatus(status, errorMessage(error), "error"),
    );
  }

  exportButton.addEventListener("click", () => {
    run(async () => {
      const now = new Date();
      const exported = exportSettings(await store.load(), now);
      // The file is built and saved inside the browser; nothing is sent
      // anywhere.
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
          type: "application/json",
        }),
      );
      const link = h("a", {
        href: url,
        download: `aws-okta-containers-settings-${now.toISOString().slice(0, 10)}.json`,
      });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return "Settings exported.";
    });
  });

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    run(async () => {
      try {
        if (file.size > MAX_IMPORT_BYTES) {
          throw new Error(IMPORT_FAILURES["not-an-export"]);
        }
        const imported = parseImport(await file.text(), REGIONS);
        if (!imported.ok) {
          const detail = imported.detail ? ` ${imported.detail}` : "";
          throw new Error(
            `${IMPORT_FAILURES[imported.reason]}${detail} Nothing was changed.`,
          );
        }
        await store.update((state) => applyImport(state, imported, new Date()));
        // An import cannot grant access. Mark what Firefox does not grant,
        // so each organization shows its "Grant access again" button.
        await refreshAccess({ store, permissions: browser.permissions });
        await registry.syncNames();
        const state = await store.load();
        const waiting = Object.values(state.organizations).filter(
          (organization) => !organization.accessGranted,
        ).length;
        return waiting === 0
          ? "Settings imported."
          : `Settings imported. ${waiting} of the organizations above need access granted.`;
      } finally {
        // So that choosing the same file again is noticed.
        importInput.value = "";
      }
    });
  });

  return { render: () => {} };
}
