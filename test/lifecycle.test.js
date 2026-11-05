import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const { window } = dom;
let reduced = false;
let holdView = false;
const observers = [];
Object.assign(globalThis, {
  window,
  document: window.document,
  Element: window.Element,
  Node: window.Node,
  HTMLImageElement: window.HTMLImageElement,
  getComputedStyle: window.getComputedStyle,
  innerWidth: 1280,
  innerHeight: 800,
  requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 4),
  cancelAnimationFrame: (id) => clearTimeout(id),
  matchMedia: () => ({ matches: reduced }),
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  // Everything is in view at once, unless a test holds the view to scroll by hand.
  IntersectionObserver: class {
    constructor(cb) {
      this.cb = cb;
      this.nodes = [];
      observers.push(this);
    }
    observe(node) {
      this.nodes.push(node);
      if (!holdView) queueMicrotask(() => this.cb([{ target: node, isIntersecting: true }]));
    }
    scrollIntoView() {
      this.cb(this.nodes.map((target) => ({ target, isIntersecting: true })));
    }
    unobserve() {}
    disconnect() {}
  },
});
window.HTMLImageElement.prototype.decode = () => Promise.resolve();
const { swarmBuild, swarmBuildPage } = await import("../src/swarm-build.js");

const leftovers = () => document.querySelectorAll("[aria-hidden]").length;
function image(parent = document.body) {
  const img = document.createElement("img");
  img.src = "http://localhost/shot.png";
  img.setAttribute("data-swarm-pending", "");
  img.dataset.swarmRegions = "0 0 50 50, 50 0 50 50, 0 50 100 50";
  parent.appendChild(img);
  return img;
}

beforeEach(() => {
  document.body.innerHTML = "";
  reduced = false;
  holdView = false;
  observers.length = 0;
});

test("a full run completes, calls onDone once and removes everything", async () => {
  const wrap = document.body.appendChild(document.createElement("div"));
  const img = image(wrap);
  let calls = 0;
  const swarm = swarmBuild(img, { start: "now", speed: 50, onDone: () => calls++ });
  assert.ok(leftovers() > 0);
  await swarm.finished;
  assert.equal(calls, 1);
  assert.equal(leftovers(), 0);
  assert.equal(wrap.style.position, "");
  assert.equal(img.hasAttribute("data-swarm-pending"), false);
});

test("finish() mid-run ends at once and calls onDone once", async () => {
  let calls = 0;
  const swarm = swarmBuild(image(), { start: "now", onDone: () => calls++ });
  await new Promise((r) => setTimeout(r, 50));
  swarm.finish();
  swarm.finish();
  await swarm.finished;
  assert.equal(calls, 1);
  assert.equal(leftovers(), 0);
});

test("destroy() mid-run resolves finished without onDone", async () => {
  let calls = 0;
  const swarm = swarmBuild(image(), { start: "now", onDone: () => calls++ });
  await new Promise((r) => setTimeout(r, 50));
  swarm.destroy();
  await swarm.finished;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, 0);
  assert.equal(leftovers(), 0);
});

test("destroy() while waiting to scroll into view resolves finished without onDone", async () => {
  holdView = true;
  let calls = 0;
  const swarm = swarmBuild(image(), { onDone: () => calls++ });
  swarm.destroy();
  await swarm.finished;
  assert.equal(calls, 0);
  assert.equal(leftovers(), 0);
});

test("starts when the image scrolls into view", async () => {
  holdView = true;
  let calls = 0;
  const swarm = swarmBuild(image(), { speed: 50, onDone: () => calls++ });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 0);
  observers[0].scrollIntoView();
  await swarm.finished;
  assert.equal(calls, 1);
});

test("two images in one parent restore its original position", async () => {
  const wrap = document.body.appendChild(document.createElement("div"));
  const swarm = swarmBuild([image(wrap), image(wrap)], { start: "now" });
  assert.equal(wrap.style.position, "relative");
  swarm.finish();
  await swarm.finished;
  assert.equal(wrap.style.position, "");
});

test("reduced motion shows the image and adds nothing", async () => {
  reduced = true;
  let calls = 0;
  const img = image();
  await swarmBuild(img, { onDone: () => calls++ }).finished;
  assert.equal(calls, 1);
  assert.equal(leftovers(), 0);
  assert.equal(img.hasAttribute("data-swarm-pending"), false);
});

test("bad input is ignored instead of throwing", async () => {
  await swarmBuild(null).finished;
  await swarmBuild([null, undefined]).finished;
  const swarm = swarmBuild(image(), { start: "now", agents: [], speed: 0 });
  swarm.finish();
  await swarm.finished;
  assert.equal(leftovers(), 0);
});

function page() {
  document.body.innerHTML = `
    <section data-swarm-block style="clip-path: circle(80%)">
      <h2 data-swarm-block>Pricing plans</h2>
      <div data-swarm-block class="card"><p data-swarm-block>Pro, $12 a month</p></div>
    </section>`;
  return [...document.querySelectorAll("[data-swarm-block]")];
}

test("page mode builds every block and restores styles and text", async () => {
  const blocks = page();
  let calls = 0;
  const swarm = swarmBuildPage("[data-swarm-block]", { speed: 50, typeSpeed: 50, onDone: () => calls++ });
  assert.equal(blocks[1].style.clipPath, "inset(0 0 100% 0)");
  await swarm.finished;
  assert.equal(calls, 1);
  assert.equal(leftovers(), 0);
  assert.equal(blocks[0].style.clipPath, "circle(80%)");
  assert.equal(blocks[2].style.clipPath, "");
  assert.equal(blocks[1].textContent, "Pricing plans");
  assert.equal(blocks[3].childNodes.length, 1);
});

test("page mode makes hidden blocks inert and restores them", async () => {
  const blocks = page();
  blocks[3].inert = false;
  holdView = true;
  const swarm = swarmBuildPage(blocks, { speed: 50, typeSpeed: 50 });
  assert.ok(blocks.every((b) => b.inert === true), "hidden blocks leave the tab order");
  observers[0].scrollIntoView();
  await swarm.finished;
  assert.equal(blocks[3].inert, false);
  assert.ok(blocks.slice(0, 3).every((b) => !b.inert));
});

test("page mode destroy() mid-typing puts the original text back", async () => {
  const blocks = page();
  const swarm = swarmBuildPage(blocks, { speed: 5, typeSpeed: 0.02 });
  for (let i = 0; i < 200 && !blocks[1].querySelector("span"); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(blocks[1].querySelector("span"), "heading is being typed");
  swarm.destroy();
  await swarm.finished;
  assert.equal(blocks[1].textContent, "Pricing plans");
  assert.equal(blocks[1].childNodes.length, 1);
  assert.equal(blocks[1].style.clipPath, "");
  assert.equal(leftovers(), 0);
});

test("page mode waits for blocks below the fold", async () => {
  holdView = true;
  page();
  let calls = 0;
  const swarm = swarmBuildPage("[data-swarm-block]", { speed: 50, onDone: () => calls++ });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 0);
  observers[0].scrollIntoView();
  await swarm.finished;
  assert.equal(calls, 1);
});

test("page mode finish() mid-typing settles and restores the text", async () => {
  const blocks = page();
  let calls = 0;
  const swarm = swarmBuildPage(blocks, { speed: 5, typeSpeed: 0.02, onDone: () => calls++ });
  for (let i = 0; i < 200 && !blocks[1].querySelector("span"); i++)
    await new Promise((r) => setTimeout(r, 20));
  assert.ok(blocks[1].querySelector("span"), "heading is being typed into one span");
  assert.equal(blocks[1].childNodes.length, 1);
  swarm.finish();
  await swarm.finished;
  assert.equal(calls, 1);
  assert.equal(blocks[1].textContent, "Pricing plans");
  assert.equal(blocks[1].querySelector("span"), null);
  assert.equal(leftovers(), 0);
});

test("page mode skips blocks that are not rendered and duplicate nodes", async () => {
  const blocks = page();
  window.Element.prototype.checkVisibility = function () {
    return this.tagName !== "H2";
  };
  try {
    const swarm = swarmBuildPage([...blocks, blocks[2]], { speed: 50, typeSpeed: 50 });
    assert.equal(blocks[1].style.clipPath, "", "the unrendered heading is left alone");
    await swarm.finished;
    assert.equal(blocks[2].style.clipPath, "");
  } finally {
    delete window.Element.prototype.checkVisibility;
  }
});

test("a second swarm over hidden blocks does not keep them hidden", async () => {
  const blocks = page();
  const first = swarmBuildPage(blocks, { speed: 50 });
  const second = swarmBuildPage(blocks, { speed: 50 });
  first.destroy();
  assert.match(blocks[2].style.clipPath, /^inset\(0/, "still held by the second swarm");
  assert.equal(blocks[2].inert, true, "still inert for the second swarm");
  second.finish();
  await Promise.all([first.finished, second.finished]);
  assert.equal(blocks[2].style.clipPath, "");
  assert.equal(blocks[0].style.clipPath, "circle(80%)");
});

test("setSpeed changes a running swarm", async () => {
  const blocks = page();
  const swarm = swarmBuildPage(blocks, { speed: 0.01 });
  swarm.setSpeed(80);
  swarm.setSpeed(-1);
  const r = await Promise.race([swarm.finished.then(() => "done"), new Promise((r) => setTimeout(() => r("slow"), 3000))]);
  assert.equal(r, "done");
});
