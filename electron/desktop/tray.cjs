/** Tray icon and menu. The icon is Nova's head cropped from the baked idle sheet. */
const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");

const HEAD = { x: 92, y: 22, width: 56, height: 56 };

function trayIcon(packId) {
  const sheet = path.join(__dirname, "..", "..", "dist", "personas", packId, "sprites", "idle.png");
  const img = nativeImage.createFromPath(sheet);
  if (img.isEmpty()) return nativeImage.createEmpty();
  return img.crop(HEAD).resize({ width: 32, height: 32, quality: "best" });
}

/**
 * @param actions { show, hide(kind), focus, open, settings, quit }
 * @param status () => { desktopEnabled, hidden }
 */
function createTray({ packId, actions, status }) {
  const tray = new Tray(trayIcon(packId));
  tray.setToolTip("Study Hub");

  function menu() {
    const s = status();
    return Menu.buildFromTemplate([
      { label: "Show Nova", enabled: s.desktopEnabled, click: actions.show },
      { label: "Hide for 1 hour", enabled: s.desktopEnabled, click: () => actions.hide("1h") },
      { label: "Hide until tomorrow", enabled: s.desktopEnabled, click: () => actions.hide("tomorrow") },
      { label: "Start focus mode", enabled: false },
      { type: "separator" },
      { label: "Open Study Hub", click: actions.open },
      { label: "Settings", click: actions.settings },
      { type: "separator" },
      { label: "Quit", click: actions.quit },
    ]);
  }

  tray.on("click", actions.open);
  tray.on("right-click", () => tray.popUpContextMenu(menu()));

  return {
    popUp: () => tray.popUpContextMenu(menu()),
    menu,
    destroy: () => tray.destroy(),
  };
}

module.exports = { createTray };
