/* Universal Branchline application rail — development only.
 * The logo (never the workspace hamburger) opens the application list.
 * The original BranchlineApplications directory owns all destinations;
 * authorization is checked by the destination app, never by this rail. */
(() => {
  "use strict";
  const catalog = window.BranchlineApplications?.list;
  if (!Array.isArray(catalog) || catalog.length !== 4) return;
  const order = ["price-tag-generator", "sales-tracker", "megaframe-studio", "flyer-studio"];
  const directory = order.map(id => catalog.find(app => app.id === id));
  if (directory.some(app => !app)) return;
  const images = {
    "price-tag-generator": "https://kzamora19.github.io/first-megasaver-ptg/icons/ptg-icon.svg",
    "sales-tracker": "icons/icon-192.png",
    "megaframe-studio": "https://kzamora19.github.io/megaframe-studio/icons/icon-192.png",
    "flyer-studio": "https://kzamora19.github.io/flyer-studio/icons/flyer-studio-192.png"
  };
  const shortNames = {
    "price-tag-generator": "PTG", "sales-tracker": "Sales",
    "megaframe-studio": "Frame", "flyer-studio": "Flyer"
  };
  const isLauncher = !!document.querySelector("nav.cards[aria-label='Branchline applications']");
  const base = isLauncher ? "../" : "./";
  const installed = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  function appLink(app, compact) {
    const link = document.createElement("a");
    link.className = compact ? "bl-rail-link" : "bl-drawer-link";
    link.href = app.id === "sales-tracker" ? base : app.url;
    if (app.id !== "sales-tracker") {
      link.target = installed ? "_self" : "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
    }
    link.title = app.name;
    link.setAttribute("aria-label", "Open " + app.name);
    if (!isLauncher && app.id === "sales-tracker") {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
    const icon = document.createElement("img");
    icon.src = app.id === "sales-tracker" ? base + images[app.id] : images[app.id];
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = shortNames[app.id];
    link.append(icon, label);
    return link;
  }

  function makeLogoButton(className, id, drawerId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    if (id) button.id = id;
    button.setAttribute("aria-label", "Open application list");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", drawerId);
    button.title = "Branchline applications";
    const image = document.createElement("img");
    image.src = base + "icons/icon-192.png";
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.append(image);
    return button;
  }

  function mount(root, header, key, workspaceButtonSelector) {
    const drawerId = "bl-app-drawer-" + key;
    root.classList.add("bl-has-app-rail");
    if (isLauncher) root.classList.add("bl-launcher-rail");
    const rail = document.createElement("nav");
    rail.className = "bl-app-rail";
    rail.setAttribute("aria-label", "Branchline applications");
    const brand = makeLogoButton("bl-rail-brand", "", drawerId);
    rail.append(brand);
    for (const app of directory) rail.append(appLink(app, true));
    root.prepend(rail);

    let mobile = isLauncher ? document.getElementById("mobileAppMenu") : null;
    if (!mobile) {
      mobile = makeLogoButton("bl-mobile-brand", "", drawerId);
      header.prepend(mobile);
    } else {
      // The launcher header is also an actual logo button, never a hamburger.
      mobile.classList.add("bl-mobile-brand");
      mobile.setAttribute("aria-controls", drawerId);
    }

    const overlay = document.createElement("div");
    overlay.id = drawerId;
    overlay.className = "bl-app-overlay";
    overlay.hidden = true;
    const drawer = document.createElement("aside");
    drawer.className = "bl-app-drawer";
    drawer.setAttribute("aria-label", "Branchline application list");
    const heading = document.createElement("h2");
    heading.textContent = "Branchline applications";
    const links = document.createElement("nav");
    links.setAttribute("aria-label", "Choose an application");
    for (const app of directory) links.append(appLink(app, false));
    drawer.append(heading, links);
    overlay.append(drawer);
    root.append(overlay);

    const triggers = [brand, mobile];
    function syncButtons(open) {
      for (const button of triggers) {
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Close application list" : "Open application list");
        button.classList.toggle("is-open", open);
      }
    }
    function close(restoreFocus = false, source = brand) {
      overlay.hidden = true;
      root.classList.remove("bl-app-menu-open");
      syncButtons(false);
      if (restoreFocus) source.focus();
    }
    function open() {
      // Only one drawer may be open; the workspace hamburger keeps its own role.
      root.querySelector(".connected-sidebar, .sidebar")?.classList.remove("open");
      overlay.hidden = false;
      root.classList.add("bl-app-menu-open");
      syncButtons(true);
    }
    for (const button of triggers) {
      button.addEventListener("click", () => overlay.hidden ? open() : close(true, button));
    }
    overlay.addEventListener("click", event => {
      if (event.target === overlay) close(true, window.matchMedia("(max-width:760px)").matches ? mobile : brand);
    });
    links.addEventListener("click", event => {
      if (event.target.closest("a")) close();
    });
    if (workspaceButtonSelector) {
      header.querySelector(workspaceButtonSelector)?.addEventListener("click", () => close());
    }
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !overlay.hidden) {
        event.preventDefault();
        close(true, window.matchMedia("(max-width:760px)").matches ? mobile : brand);
      }
    });
  }

  if (isLauncher) {
    const header = document.querySelector("header");
    if (header) mount(document.body, header, "launcher", null);
  } else {
    for (const [selector, key, headerSelector, menu] of [
      [".connected-shell", "connected", ".connected-topbar", "#connected-menu"],
      ["#demo-app", "demo", ".topbar", "#mobile-menu"]
    ]) {
      const root = document.querySelector(selector);
      const header = root?.querySelector(headerSelector);
      if (root && header) mount(root, header, key, menu);
    }
  }
})();
