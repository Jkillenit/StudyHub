// Run in the Blackboard window as `(<this file>)(fileName, fileUrl)` to download a file the way the
// student would: open the item's "more" menu and pick Download. If no menu item is found, the URL is
// left in window.__shFallbackDownload for the main process to download directly.
// Must stay one function expression with no trailing semicolon.
(function (targetName, fileUrl) {
  try {
    const baseName = targetName.replace(/\.[^.]+$/, "");
    let targetBtn = null;
    for (const el of document.querySelectorAll("[title], [aria-label]")) {
      const text = (el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || "").trim();
      if (!text.includes(baseName) && !text.includes(targetName)) continue;
      const container = el.closest('[class*="item"],[class*="content"],[role="listitem"]') || el.parentElement;
      targetBtn = container?.querySelector(
        '[data-testid*="more"],[aria-label*="more"],[aria-label*="option"],button[aria-haspopup],[class*="context-menu"]'
      );
      if (targetBtn) break;
    }

    if (targetBtn) {
      targetBtn.click();
      setTimeout(function () {
        for (const item of document.querySelectorAll('[role="menuitem"],[role="option"],[class*="menu-item"]')) {
          const t = (item.textContent || "").toLowerCase();
          if (t.includes("download") || t.includes("original")) {
            item.click();
            return;
          }
        }
        window.__shFallbackDownload = fileUrl;
      }, 300);
      return true;
    }
    window.__shFallbackDownload = fileUrl;
    return false;
  } catch {
    window.__shFallbackDownload = fileUrl;
    return false;
  }
})
