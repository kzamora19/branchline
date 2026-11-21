/* Public Branchline application directory: navigation only.
 * Opening an app never forwards the Branchline access token or password.
 * Each destination enforces its own account/role permissions. */
(() => {
  "use strict";
  const list = [
    {
      id: "sales-tracker",
      name: "Sales Tracker",
      monogram: "ST",
      description: "Sales entry, team performance, targets, analytics and inventory.",
      access: "Your current Branchline workspace",
      kind: "workspace",
      url: "",
    },
    {
      id: "price-tag-generator",
      name: "Price Tag Generator",
      monogram: "PT",
      description: "Find products, review selling prices, prepare and print price tags.",
      access: "Existing PTG account permissions apply",
      kind: "external",
      url: "https://kzamora19.github.io/first-megasaver-ptg/",
    },
    {
      id: "megaframe-studio",
      name: "MegaFrame Studio",
      monogram: "MF",
      description: "Edit photos, build personalized frames and export print-ready layouts.",
      access: "MegaFrame Studio sign-in and permissions apply",
      kind: "external",
      url: "https://megaframe-studio.vercel.app/",
    },
    {
      id: "flyer-studio",
      name: "Flyer Studio",
      monogram: "FS",
      description: "Create promotional flyers, manage product bundles and export PDF artwork.",
      access: "Flyer Studio sign-in and permissions apply",
      kind: "external",
      url: "https://kzamora19.github.io/flyer-studio/",
    },
  ];
  for (const app of list) {
    if (app.kind === "external") {
      const target = new URL(app.url);
      if (target.protocol !== "https:" || target.username || target.password || target.hash || target.search)
        throw new Error("Unrecognized Branchline application URL.");
    }
    Object.freeze(app);
  }
  window.BranchlineApplications = Object.freeze({ list: Object.freeze(list) });
})();
