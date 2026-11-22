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
    assert.equal(url.search, app.id === "megaframe-studio" ? "?studio=megaframe" :
      app.id === "flyer-studio" ? "?studio=flyer" : "");
    assert.equal(url.hash, "");
  }
  assert.match(authSource, /const actionTarget = openInside \? "_self" : "_blank"/);
  assert.match(authSource, /target="\$\{actionTarget\}" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.match(authSource, /window\.matchMedia\("\(display-mode: standalone\)"\)/);
  assert.doesNotMatch(authSource.slice(authSource.indexOf("function renderApplicationsPage()"),authSource.indexOf("function dangerZonePanel()")), /access_token|sessionStorage|localStorage|refresh_token|apiKey|apikey/);
});

test("both Creative Studio cards route through PTG instead of bypassing its TL+ gate", () => {
  const portal = "https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=";
  const studios = apps.filter(app => ["megaframe-studio", "flyer-studio"].includes(app.id));
  assert.deepEqual(studios.map(app => app.url), [portal + "megaframe", portal + "flyer"]);
  assert.deepEqual(studios.map(app => app.name), ["MegaFrame Studio", "MegaFlyer Studio"]);
  assert.ok(studios.every(app => /PTG Team Leader, Branch Admin or System Admin/.test(app.access)));
  assert.ok(studios.every(app => !["/megaframe-studio/", "/flyer-studio/"].includes(new URL(app.url).pathname)));
  assert.equal(new URL(studios[0].url).searchParams.get("studio"),"megaframe");
  assert.equal(new URL(studios[1].url).searchParams.get("studio"),"flyer");
  assert.ok(studios.every(app=>!new URL(app.url).searchParams.has("ticket")));
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

  const launcher = readFileSync(path("apps/index.html"),"utf8");
  const pwa = JSON.parse(readFileSync(path("manifest.webmanifest"),"utf8"));
  assert.equal(pwa.start_url,"./apps/");
  assert.equal(pwa.scope, "/", "Installed app scope must include sibling same-origin PTG/Studio paths");
  const appOrigin = "https://kzamora19.github.io";
  assert.ok(apps.slice(1).every(app => new URL(app.url).origin === appOrigin), "Every linked module must remain on the verified same origin");
  assert.ok(apps.slice(1).every(app => new URL(app.url).pathname.startsWith(pwa.scope)), "Installed navigation stays in PWA scope");
  for(const app of apps)assert.ok(launcher.includes('data-app="'+app.id+'"'),"Missing launcher card: "+app.id);
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
