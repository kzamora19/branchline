/* Universal Branchline application rail — deployed Workspace.
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
  const r6Icons = {
    "price-tag-generator": "ptg", "sales-tracker": "sales",
    "megaframe-studio": "megaframe", "flyer-studio": "megaflyer"
  };
  const shortNames = {
    "price-tag-generator": "PTG", "sales-tracker": "Sales",
    "megaframe-studio": "Frame", "flyer-studio": "Flyer"
  };
  const isLauncher = !!document.querySelector("nav.cards[aria-label='Branchline applications']");
  const base = isLauncher ? "../" : "./";
  const artwork = base + "icons/r6/";
  const nativeHost = Boolean(window.chrome?.webview);
  // Application navigation must stay within the current Workspace window,
  // including WebView2 installations where display-mode is not standalone.

  function appLink(app, compact) {
    const link = document.createElement("a");
    link.className = compact ? "bl-rail-link" : "bl-drawer-link";
    link.href = app.id === "sales-tracker" ? base : app.url;
    if (app.id !== "sales-tracker") {
      link.target = "_self";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
    }
    link.title = app.name;
    link.setAttribute("aria-label", "Open " + app.name);
    if (!isLauncher && app.id === "sales-tracker") {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
    const icon = document.createElement(nativeHost ? "span" : "img");
    if (nativeHost) {
      icon.className = "bl-official-app-icon " + app.id;
    } else {
      icon.className = "bl-r6-app-icon";
      icon.src = artwork + "Approved." + r6Icons[app.id] + ".png";
      icon.alt = "";
    }
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
    image.src = nativeHost ? base + "icons/official/branchline.png" : artwork + "Approved.branchline.png";
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
    // The browser-installed workspace uses the R6 top application bar.
    // Native WebView2 keeps its own original window chrome and app shortcuts.
    if (!nativeHost) {
      root.classList.add("bl-web-r6");
      const megasaver = document.createElement("img");
      megasaver.className = "bl-r6-megasaver";
      megasaver.src = artwork + "FirstMegasaverHeader.png";
      megasaver.alt = "1st Megasaver";
      brand.after(megasaver);
      const account=root.querySelector(".connected-account");
      if(account){
        const originalParent=account.parentElement;
        const details=document.createElement("details");details.className="bl-r6-account";
        const summary=document.createElement("summary");
        const name=document.createElement("strong"),role=document.createElement("small");
        summary.append(name,role);details.append(summary);rail.append(details);
        const sync=()=>{
          name.textContent=account.querySelector("#connected-user-name")?.textContent?.trim()||"Account";
          role.textContent=account.querySelector("#connected-user-role")?.textContent?.trim()||"";
          role.hidden=!role.textContent;
        };
        new MutationObserver(sync).observe(account,{childList:true,characterData:true,subtree:true});
        sync();
        const desktop=window.matchMedia("(min-width:761px)");
        const place=()=>{if(desktop.matches){details.append(account);}else{details.open=false;originalParent.append(account);}};
        desktop.addEventListener?.("change",place);place();
        document.addEventListener("click",e=>{if(details.open&&!details.contains(e.target))details.open=false;});
      }
    }


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
      if (workspaceButtonSelector) header.querySelector(workspaceButtonSelector)?.setAttribute("aria-expanded", "false");
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
      const workspaceButton = header.querySelector(workspaceButtonSelector);
      const sidebar = root.querySelector(".connected-sidebar, .sidebar");
      const desktop = window.matchMedia("(min-width: 761px)");
      if (workspaceButton) {
        function syncWorkspaceButton() {
          const expanded = desktop.matches
            ? !root.classList.contains("bl-workspace-collapsed")
            : !!sidebar?.classList.contains("open");
          workspaceButton.setAttribute("aria-expanded", String(expanded));
          workspaceButton.setAttribute("aria-label", expanded ? "Close workspace menu" : "Open workspace menu");
          workspaceButton.title = expanded ? "Close workspace menu" : "Open workspace menu";
        }
        workspaceButton.addEventListener("click", () => {
          close(); // Never allow both drawers at the same time.
          if (desktop.matches) {
            root.classList.toggle("bl-workspace-collapsed");
            sidebar?.classList.remove("open");
          } // Existing app handler owns the mobile sidebar toggle.
          syncWorkspaceButton();
        });
        desktop.addEventListener?.("change", () => {
          root.classList.remove("bl-workspace-collapsed");
          sidebar?.classList.remove("open");
          syncWorkspaceButton();
        });
        syncWorkspaceButton();
      }
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
