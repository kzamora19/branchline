/* Branchline application rail: navigation only, never handles user credentials.
   The existing BranchlineApplications directory remains the destination source. */
(() => {
  "use strict";
  const directory = window.BranchlineApplications?.list;
  if (!Array.isArray(directory) || directory.length !== 4) return;
  const icons = {
    "sales-tracker": "icons/icon-192.png",
    "price-tag-generator": "https://kzamora19.github.io/first-megasaver-ptg/icons/ptg-icon.svg",
    "megaframe-studio": "https://kzamora19.github.io/megaframe-studio/icons/icon-192.png",
    "flyer-studio": "https://kzamora19.github.io/flyer-studio/icons/flyer-studio-192.png"
  };
  const shortNames = {
    "sales-tracker": "Sales",
    "price-tag-generator": "PTG",
    "megaframe-studio": "Frame",
    "flyer-studio": "Flyer"
  };
  const launcher = Boolean(document.querySelector("nav.cards[data-app-rail-source], nav.cards[aria-label='Branchline applications']"));
  const base = launcher ? "../" : "./";
  function appLink(app, compact = false) {
    const anchor = document.createElement("a");
    anchor.className = compact ? "bl-rail-link" : "bl-drawer-link";
    const isSales = app.id === "sales-tracker";
    anchor.href = isSales ? base : app.url;
    if (!isSales) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.referrerPolicy = "no-referrer";
    }
    anchor.title = app.name;
    anchor.setAttribute("aria-label", "Open " + app.name);
    if (!launcher && isSales) {
      anchor.classList.add("is-active");
      anchor.setAttribute("aria-current", "page");
    }
    const icon = document.createElement("img");
    icon.src = isSales ? base + icons[app.id] : icons[app.id];
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = shortNames[app.id];
    anchor.append(icon, label);
    return anchor;
  }
  function createRail() {
    const rail = document.createElement("nav");
    rail.className = "bl-app-rail";
    rail.setAttribute("aria-label", "Switch Branchline applications");
    const brand = document.createElement("a");
    brand.className = "bl-rail-brand";
    brand.href = launcher ? "../apps/" : "./apps/";
    brand.title = "Branchline application launcher";
    brand.setAttribute("aria-label", "Branchline application launcher");
    const brandIcon = document.createElement("img");
    brandIcon.src = base + "icons/icon-192.png";
    brandIcon.alt = "";
    brand.append(brandIcon);
    rail.append(brand);
    for (const app of directory) rail.append(appLink(app, true));
    return rail;
  }
  // The launcher retains its own hamburger-driven mobile drawer.
  if (launcher) {
    document.body.classList.add("bl-has-app-rail", "bl-launcher-rail");
    document.body.prepend(createRail());
    return;
  }
  for (const [selector, key, headerSelector, workspaceButtonSelector] of [
    [".connected-shell", "connected", ".connected-topbar", "#connected-menu"],
    ["#demo-app", "demo", ".topbar", "#mobile-menu"]
  ]) {
    const shell = document.querySelector(selector);
    const header = shell?.querySelector(headerSelector);
    if (!shell || !header) continue;
    shell.classList.add("bl-has-app-rail");
    shell.prepend(createRail());
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "bl-app-switcher";
    trigger.setAttribute("aria-label", "Open application list");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "bl-app-drawer-" + key);
    trigger.title = "Switch application";
    trigger.textContent = "▦";
    header.prepend(trigger);
    const overlay = document.createElement("div");
    overlay.id = "bl-app-drawer-" + key;
    overlay.className = "bl-app-overlay";
    overlay.hidden = true;
    const drawer = document.createElement("aside");
    drawer.className = "bl-app-drawer";
    const heading = document.createElement("h2");
    heading.textContent = "Branchline applications";
    drawer.append(heading);
    const links = document.createElement("nav");
    links.setAttribute("aria-label", "Branchline applications");
    for (const app of directory) links.append(appLink(app));
    drawer.append(links);
    overlay.append(drawer);
    shell.append(overlay);
    function closeAppDrawer(restoreFocus = false) {
      overlay.hidden = true;
      shell.classList.remove("bl-app-menu-open");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", "Open application list");
      if (restoreFocus) trigger.focus();
    }
    function openAppDrawer() {
      shell.querySelector(".connected-sidebar, .sidebar")?.classList.remove("open");
      overlay.hidden = false;
      shell.classList.add("bl-app-menu-open");
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-label", "Close application list");
    }
    trigger.addEventListener("click", () => overlay.hidden ? openAppDrawer() : closeAppDrawer(true));
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeAppDrawer(true);
    });
    header.querySelector(workspaceButtonSelector)?.addEventListener("click", () => closeAppDrawer());
    links.addEventListener("click", event => {
      if (event.target.closest("a")) closeAppDrawer();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !overlay.hidden) closeAppDrawer(true);
    });
    window.matchMedia("(min-width:761px)").addEventListener("change", event => {
      if (event.matches) closeAppDrawer();
    });
  }
})();
