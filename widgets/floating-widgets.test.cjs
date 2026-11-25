const test=require("node:test");
const assert=require("node:assert/strict");
const {unreadLabel,assetURL}=require("./floating-widgets.js");
test("badge uses real nonnegative integer counts and caps the display",()=>{
  for(const [n,label] of [[0,""],[-1,""],[1,"1"],[99,"99"],[100,"99+"],[1.5,""],["3",""],[NaN,""]])assert.equal(unreadLabel(n),label);
});
test("artwork must be explicit, same-origin and in the approved asset directory",()=>{
  const base="https://kzamora19.github.io/branchline/apps/";
  assert.equal(assetURL("../widgets/assets/robot.webp",base),"https://kzamora19.github.io/branchline/widgets/assets/robot.webp");
  for(const value of [undefined,"","https://example.com/branchline/widgets/assets/robot.png","../icons/robot.png","../widgets/assets/robot.html","../widgets/assets/../../icon.svg"])assert.throws(()=>assetURL(value,base),TypeError);
});

test("existing device preferences enable speech by default and respect explicit opt-out",()=>{const {normalizePreferences}=require("./floating-widgets.js");assert.equal(normalizePreferences({side:"left",motion:false}).bubbles,true);assert.equal(normalizePreferences({bubbles:false}).bubbles,false);});
