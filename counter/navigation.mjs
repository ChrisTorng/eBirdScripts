// A single same-document entry lets Back dismiss UI without losing the trip.
// Reload reuses the existing entry; explicit departure can still leave the app.
export function installBackNavigation(win, handlers) {
  if (!win.history.state?.counterGuard) {
    win.history.replaceState({ counterBase: true }, "");
    win.history.pushState({ counterGuard: true }, "");
  }
  let leaving = false;
  win.addEventListener("popstate", async () => {
    if (leaving) return;
    if (handlers.dismiss()) {
      win.history.pushState({ counterGuard: true }, "");
      return;
    }
    if (handlers.active()) {
      win.history.pushState({ counterGuard: true }, "");
      if (await handlers.confirmLeave()) {
        handlers.save();
        leaving = true;
        win.history.go(-2);
      }
    } else {
      leaving = true;
      win.history.back();
    }
  });
}
