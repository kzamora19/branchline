import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path = file => new URL("../" + file, import.meta.url);
const catalogSource = readFileSync(path("branchline-applications.js"), "utf8");
const authSource = readFileSync(path("auth-app.js"), "utf8");
const html = readFileSync(path("index.html"), "utf8");
const styles = readFileSync(path("styles.css"), "utf8");
const serviceWorker = readFileSync(path("sw.js"), "utf8");
const localWindow = {};
new Function("window", "URL", catalogSource)(localWindow, URL);
const apps = localWindow.BranchlineApplications.list;

test("catalog contains all four expected applications with no duplication", () => {
  assert.deepEqual(apps.map(app => app.id), [
    "sales-tracker", "price-tag-generator", "megaframe-studio", "flyer-studio"
  ]);
  assert.equal(apps[0].kind, "workspace");
  assert.equal(apps[0].url, "");
  assert.equal(Object.isFrozen(apps), true);
  assert.equal(apps.every(app => Object.isFrozen(app)), true);
});

test("external apps open verified HTTPS domains without credentials or OAuth state", () => {
  assert.deepEqual(apps.slice(1).map(app => new URL(app.url).origin), [
    "https://kzamora19.github.io",
    "https://kzamora19.github.io",
    "https://kzamora19.github.io"
  ]);
  for (const app of apps.slice(1)) {
    assert.equal(app.kind, "external");
    const url = new URL(app.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    const expectedStudio = app.id === "megaframe-studio" ? "megaframe" :
      app.id === "flyer-studio" ? "flyer" : "";
    assert.equal(url.search, expectedStudio ? "?studio=" + expectedStudio : "");
    if (expectedStudio) assert.equal(url.pathname, "/first-megasaver-ptg/studios/");
    assert.equal(url.hash, "");
  }
  assert.match(authSource, /target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.doesNotMatch(authSource.slice(authSource.indexOf("function renderApplicationsPage()"),authSource.indexOf("function dangerZonePanel()")), /access_token|sessionStorage|localStorage|refresh_token|apiKey|apikey/);
});

test("every signed-in role can view the hub; independent app permissions are described", () => {
  for (const role of ["ps","manager","district_manager","admin","inventory_controller","stock_custodian"]) {
    const match = authSource.match(new RegExp("^\\s+" + role + ": \\[([^\\n]+)\\]", "m"));
    assert.ok(match, "Role entry: " + role);
    assert.ok(match[1].includes('"apps"'), "App hub is available to " + role);
  }
  assert.match(authSource, /activePage === "apps"\) renderApplicationsPage/);
  assert.match(authSource, /does not share your Branchline password or session/);
});

test("new app script loads before workspace, and current shell assets are available offline", () => {
  const hubTag = html.match(/<script src="(branchline-applications\.js(?:\?[^"]+)?)"><\/script>/);
  const appTag = html.match(/<script src="(auth-app\.js(?:\?[^"]+)?)"><\/script>/);
  const styleTag = html.match(/<link rel="stylesheet" href="(styles\.css(?:\?[^"]+)?)">/);
  assert.ok(hubTag && appTag && styleTag, "Versioned hub, app and stylesheet assets must exist");
  assert.ok(html.indexOf(hubTag[0]) < html.indexOf(appTag[0]), "Hub must load before workspace");
  assert.match(serviceWorker, /branchline-shell-v\d+/);
  for (const resource of [hubTag[1], appTag[1], styleTag[1]]) {
    assert.ok(serviceWorker.includes('"' + "./" + resource + '"'), resource + " must be cached for PWA offline use");
  }
  const chooser = readFileSync(path("apps/index.html"), "utf8");
  const pwaManifest = JSON.parse(readFileSync(path("manifest.webmanifest"), "utf8"));
  assert.equal(pwaManifest.start_url, "./apps/");
  assert.match(chooser, /Your apps/);
  for (const app of apps) assert.ok(chooser.includes('data-app="' + app.id + '"'), "Launcher card: " + app.id);
  assert.match(chooser, /\\?studio=megaframe/);
  assert.match(chooser, /\\?studio=flyer/);
  assert.ok(serviceWorker.includes('"./apps/"'));
  assert.ok(serviceWorker.includes('"./apps/index.html"'));
  assert.ok(styles.includes(".branchline-app-grid"));
  assert.ok(styles.includes("grid-template-columns:1fr"));
  assert.doesNotThrow(() => new Function(authSource));
  assert.doesNotThrow(() => new Function(catalogSource));
});

test("PS assist drilldown values are accessible, unboxed blue underlined text buttons", () => {
  const style = styles.match(/\.traffic-table-wrap \.traffic-assist-link\s*\{([^}]+)\}/)?.[1];
  assert.ok(style, "PS assistance link styling must exist");
  assert.match(style, /border:\s*0\s*;/);
  assert.match(style, /background:\s*transparent\s*;/);
  assert.match(style, /padding:\s*0\s*;/);
  assert.match(style, /color:\s*var\(--blue\)\s*;/);
  assert.match(style, /text-decoration:\s*underline\s*;/);
  assert.match(styles, /\.traffic-table-wrap \.traffic-assist-link:focus-visible/);
  assert.match(authSource, /<button type="button" class="traffic-assist-link"/);
  assert.match(authSource, /data-review-ps-day/);
  assert.match(authSource, /data-ps-review-person/);
});

test("launcher app cards and mobile drawer are transparent with visible outlines", () => {
  const launcher = readFileSync(path("apps/branchline-ui-stage.css"), "utf8");
  const drawer = readFileSync(path("apps/branchline-outlined-drawer.css"), "utf8");
  const html = readFileSync(path("apps/index.html"), "utf8");
  const card = launcher.match(/\\.card\\{([^}]+)\\}/)?.[1];
  const icon = launcher.match(/\\.app-icon\\{([^}]+)\\}/)?.[1];
  const drawerCard = drawer.match(/\\.drawer-app\\{([^}]+)\\}/)?.[1];
  for (const [name, rule] of [["launcher card", card], ["app icon", icon], ["drawer card", drawerCard]]) {
    assert.ok(rule, name + " style exists");
    assert.match(rule, /background:\\s*transparent\\s*;/, name + " must not have a solid fill");
  }
  assert.match(card, /border:\\s*1px\\s+solid\\s+#[0-9a-f]+\\s*;/i);
  assert.match(drawerCard, /border:\\s*1px\\s+solid\\s+#[0-9a-f]+\\s*;/i);
  for (const id of ["sales-tracker", "price-tag-generator", "megaframe-studio", "flyer-studio"]) {
    assert.ok(html.includes('data-app="' + id + '"'), "Existing app route retained: " + id);
  }
});
