import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const { window } = dom;
let reduced = false;
const observers = [];
Object.assign(globalThis, {
  window,
  document: window.document,
  Element: window.Element,
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
  IntersectionObserver: class {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  },
});
window.HTMLImageElement.prototype.decode = () => Promise.resolve();
const { swarmBuild } = await import("../src/swarm-build.js");

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
  let calls = 0;
  const swarm = swarmBuild(image(), { onDone: () => calls++ });
  swarm.destroy();
  await swarm.finished;
  assert.equal(calls, 0);
  assert.equal(leftovers(), 0);
});

test("starts when the image scrolls into view", async () => {
  let calls = 0;
  const swarm = swarmBuild(image(), { speed: 50, onDone: () => calls++ });
  observers[0].cb([{ isIntersecting: true }]);
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
