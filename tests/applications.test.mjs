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
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
  assert.match(authSource, /target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.doesNotMatch(authSource.slice(authSource.indexOf("function renderApplicationsPage()"),authSource.indexOf("function dangerZonePanel()")), /access_token|sessionStorage|localStorage|refresh_token|apiKey|apikey/);
});

test("both Creative Studio cards route through PTG instead of bypassing its TL+ gate", () => {
  const portal = "https://kzamora19.github.io/first-megasaver-ptg/studios/";
  const studios = apps.filter(app => ["megaframe-studio", "flyer-studio"].includes(app.id));
  assert.deepEqual(studios.map(app => app.url), [portal, portal]);
  assert.deepEqual(studios.map(app => app.name), ["MegaFrame Studio", "MegaFlyer Studio"]);
  assert.ok(studios.every(app => /PTG Team Leader, Branch Admin or System Admin/.test(app.access)));
  assert.ok(studios.every(app => !["/megaframe-studio/", "/flyer-studio/"].includes(new URL(app.url).pathname)));
  // Authorization must still be enforced by PTG and the private studio delivery service.
  assert.doesNotMatch(catalogSource, /vercel[.]app/);
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

test("new app script loads before workspace, and new shell is available offline", () => {
  assert.ok(html.indexOf('branchline-applications.js?v=megaframe-pages-20261121') <
            html.indexOf('auth-app.js?v=certificate-label-20261121'));
  assert.match(serviceWorker, /branchline-shell-v190/);
  assert.ok(serviceWorker.includes('auth-app.js?v=certificate-label-20261121'));
  assert.ok(serviceWorker.includes("branchline-applications.js?v=megaframe-pages-20261121"));
  assert.ok(styles.includes(".branchline-app-grid"));
  assert.ok(styles.includes("grid-template-columns:1fr"));
  assert.doesNotThrow(() => new Function(authSource));
  assert.doesNotThrow(() => new Function(catalogSource));
});

test("Sales Tracker is labeled immediately below both sidebar logo lockups",()=>{
  assert.equal((html.match(/class="branchline-module-label">SALES TRACKER<\/div>/g)||[]).length,2);
  assert.match(html,/<a class="brand" href="#" aria-label="Branchline home">[\s\S]*?<span class="brand-name">branchline[\s\S]*?<\/a>\s*<div class="branchline-module-label">SALES TRACKER<\/div>/);
  assert.match(styles,/\.connected-sidebar \.branchline-module-label/);
  assert.match(styles,/margin:7px 11px 0 48px/);
  assert.match(styles,/color:var\(--blue-dark\)/);
  assert.match(styles,/--blue: #355ee8/);
  assert.match(styles,/--blue-dark: #2348c7/);
  assert.match(styles,/--blue-soft: #eef2ff/);
});
