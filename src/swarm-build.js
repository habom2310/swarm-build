// swarm-build: a swarm of named cursors builds an image, region by region.
// Dependency-free ES module. MIT licensed. See README.md and skills/swarm-build/SKILL.md.

export const DEFAULT_AGENTS = [
  { name: "Ava", color: "#2563eb", text: "#fff" },
  { name: "Kai", color: "#e11d48", text: "#fff" },
  { name: "Noor", color: "#16a34a", text: "#fff" },
  { name: "Theo", color: "#f59e0b", text: "#17171a" },
  { name: "Mia", color: "#9333ea", text: "#fff" },
  { name: "Ravi", color: "#0891b2", text: "#fff" },
];

/** A header, a sidebar, a main block and two cards: a fallback for when no regions are given. */
export function autoRegions() {
  return [
    { x: 0, y: 0, w: 100, h: 12 },
    { x: 0, y: 12, w: 28, h: 88 },
    { x: 28, y: 12, w: 72, h: 42 },
    { x: 28, y: 54, w: 36, h: 46 },
    { x: 64, y: 54, w: 36, h: 46 },
  ];
}

/** Parses "x y w h, x y w h" (percent of the image) into regions. */
export function parseRegions(text) {
  return text
    .split(/[,;]/)
    .map((part) => part.trim().split(/\s+/).map(Number))
    .filter((n) => n.length === 4 && n.every(Number.isFinite))
    .map(([x, y, w, h]) => ({ x, y, w, h }));
}

/** Round-robin: agent a takes tasks a, a + n, a + 2n... */
export function assignTasks(taskCount, agentCount) {
  const n = Math.max(1, Math.min(agentCount, taskCount));
  return Array.from({ length: n }, (_, a) => {
    const mine = [];
    for (let i = a; i < taskCount; i += n) mine.push(i);
    return mine;
  });
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 2;
const easeIn = (t) => t * t;
const lerp = (a, b, t) => a + (b - a) * t;
const inset = ({ x, y, w, h }, hPct = h) => `inset(${y}% ${100 - x - w}% ${100 - y - hPct}% ${x}%)`;
const ABORT = Symbol("swarm-build destroyed");

function el(tag, style, parent) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  parent?.appendChild(node);
  return node;
}

// Built with DOM calls, not innerHTML, so it works under strict CSP and Trusted Types.
function cursorIcon(color) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const path = document.createElementNS(ns, "path");
  for (const [k, v] of Object.entries({ width: 16, height: 20, viewBox: "0 0 16 20" })) svg.setAttribute(k, v);
  for (const [k, v] of Object.entries({
    d: "M1.5 1.5v15l4-4 3 6.2 2.6-1.2-3-6.1h5.6z",
    fill: color,
    stroke: "#fff",
    "stroke-width": 1.5,
    "stroke-linejoin": "round",
  }))
    path.setAttribute(k, v);
  Object.assign(svg.style, { display: "block", filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.25))" });
  svg.appendChild(path);
  return svg;
}

function imageSource(node) {
  if (node instanceof HTMLImageElement) return node.currentSrc || node.src;
  return getComputedStyle(node).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] ?? "";
}

function normalize(targets) {
  const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  return list.flatMap((t) => {
    const node = t instanceof Element ? t : t.el;
    if (!node?.parentElement) return [];
    const given = t instanceof Element ? null : t.regions;
    const parsed = node.dataset.swarmRegions ? parseRegions(node.dataset.swarmRegions) : [];
    const regions = given?.length ? given : parsed.length ? parsed : autoRegions();
    const src = (t instanceof Element ? null : t.src) || imageSource(node);
    if (!src) {
      console.warn("swarm-build: no image URL for", node);
      return [];
    }
    return [{ node, regions, src }];
  });
}

/**
 * Builds each target image region by region with a swarm of cursors.
 * `finished` always resolves. `onDone` runs once when the build completes or `finish()` is
 * called, never after `destroy()`.
 * @param {import("./swarm-build").Target | import("./swarm-build").Target[]} targets
 * @param {import("./swarm-build").Options} [options]
 * @returns {import("./swarm-build").SwarmBuild}
 */
export function swarmBuild(targets, options = {}) {
  const { start = "visible", canvas = "#fff", zIndex = 2147483000, onDone } = options;
  const agents = options.agents?.length ? options.agents : DEFAULT_AGENTS;
  const speed = options.speed > 0 ? options.speed : 1;
  const items = normalize(targets);
  const reveal = () => items.forEach(({ node }) => node.removeAttribute("data-swarm-pending"));

  // Reduced motion, or the CSS fallback already showed the image: nothing to build.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fallbackShown = items.some(({ node }) =>
    node
      .getAnimations?.()
      .some((a) => a.animationName === "swarm-build-fallback" && a.playState === "finished"),
  );
  if (reduced || fallbackShown || items.length === 0) {
    reveal();
    onDone?.();
    return { finished: Promise.resolve(), finish() {}, destroy() {} };
  }

  let state = "idle"; // idle, running, ended
  let done = false; // finish() was called: every tween jumps to its end
  let resolveFinished;
  const finished = new Promise((r) => (resolveFinished = r));
  const cleanups = [];

  // One loop drives every tween, the cursors and the overlay positions.
  const active = new Set();
  let frame = 0;
  const settle = (tw, t) => {
    tw.update(t);
    if (t >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  };
  const tick = (now) => {
    for (const tw of [...active]) settle(tw, Math.min(1, (now - tw.t0) / tw.duration));
    layers.forEach((l) => l.place());
    renderCursors();
    frame = requestAnimationFrame(tick);
  };
  /** Animates t from 0 to 1 over `seconds`; rejects with ABORT after destroy(). */
  const tween = (seconds, update = () => {}) =>
    new Promise((resolve, reject) => {
      if (state === "ended") return reject(ABORT);
      const tw = { t0: performance.now(), duration: (seconds * 1000) / speed, update, resolve, reject };
      if (done) settle(tw, 1);
      else active.add(tw);
    });

  // Per image, inside its parent so the parent's rounded corners clip it: a blank canvas, plus
  // a tile, box and size badge for each region.
  const parents = new Map();
  const layers = items.map(({ node, regions, src }) => {
    const parent = node.parentElement;
    if (!parents.has(parent)) {
      parents.set(parent, parent.style.position);
      if (["static", ""].includes(getComputedStyle(parent).position)) parent.style.position = "relative";
    }
    const layer = el("div", { position: "absolute", pointerEvents: "none", zIndex: "1", overflow: "hidden" });
    layer.setAttribute("aria-hidden", "true");
    node.after(layer);

    // The image paints in its content box; keep the layer exactly there.
    let edges;
    const measure = () => {
      const cs = getComputedStyle(node);
      const px = (k) => parseFloat(cs[k]) || 0;
      edges = {
        l: px("borderLeftWidth") + px("paddingLeft"),
        t: px("borderTopWidth") + px("paddingTop"),
        r: px("borderRightWidth") + px("paddingRight"),
        b: px("borderBottomWidth") + px("paddingBottom"),
      };
      layer.style.borderRadius = cs.borderRadius;
    };
    measure();
    const box = () => {
      const r = node.getBoundingClientRect();
      return {
        left: r.left + edges.l,
        top: r.top + edges.t,
        width: r.width - edges.l - edges.r,
        height: r.height - edges.t - edges.b,
      };
    };
    const place = () => {
      const b = box();
      const p = parent.getBoundingClientRect();
      Object.assign(layer.style, {
        left: `${b.left - p.left - parent.clientLeft + parent.scrollLeft}px`,
        top: `${b.top - p.top - parent.clientTop + parent.scrollTop}px`,
        width: `${b.width}px`,
        height: `${b.height}px`,
      });
    };
    place();
    const observer = new ResizeObserver(() => {
      measure();
      place();
    });
    observer.observe(node);
    cleanups.push(() => {
      observer.disconnect();
      layer.remove();
    });

    const cover = el("div", { position: "absolute", inset: "0", background: canvas }, layer);
    const parts = regions.map((region) => {
      const tile = el(
        "div",
        {
          position: "absolute",
          inset: "0",
          backgroundImage: `url(${JSON.stringify(src)})`,
          backgroundSize: "100% 100%",
          clipPath: inset(region, 0),
        },
        layer,
      );
      const frameBox = el(
        "div",
        {
          position: "absolute",
          left: `${region.x}%`,
          top: `${region.y}%`,
          width: "0",
          height: "0",
          border: "1px solid",
          background: "rgb(128 128 128 / 0.12)",
          boxSizing: "border-box",
          visibility: "hidden",
        },
        layer,
      );
      // Below the box, or inside its bottom edge when the box reaches the image's bottom.
      const low = region.y + region.h > 92;
      const badge = el(
        "span",
        {
          position: "absolute",
          left: "50%",
          ...(low ? { bottom: "4px" } : { top: "100%", marginTop: "4px" }),
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          borderRadius: "3px",
          padding: "1px 4px",
          font: "500 10px/14px system-ui, sans-serif",
          fontVariantNumeric: "tabular-nums",
        },
        frameBox,
      );
      return { region, tile, box: frameBox, badge };
    });
    return { node, cover, parts, box, place };
  });
  cleanups.push(() => parents.forEach((position, parent) => (parent.style.position = position)));
  reveal();

  // Cursors live in one fixed layer and follow their images through scroll and resize.
  const stage = el("div", {
    position: "fixed",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: String(zIndex),
  });
  stage.setAttribute("aria-hidden", "true");
  document.body.appendChild(stage);
  cleanups.push(() => stage.remove());

  const tasks = layers.flatMap((layer, target) => layer.parts.map((part) => ({ target, part })));
  const plan = assignTasks(tasks.length, agents.length);

  /** An anchor is a point in percent of an image, or in viewport pixels (target = -1). */
  const resolve = ({ target, x, y }) => {
    if (target < 0) return { x, y };
    const b = layers[target].box();
    return { x: b.left + (x / 100) * b.width, y: b.top + (y / 100) * b.height };
  };

  const cursors = plan.map((_, a) => {
    const agent = { text: "#fff", ...agents[a % agents.length] };
    const node = el("div", { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" }, stage);
    node.appendChild(cursorIcon(agent.color));
    const label = el(
      "span",
      {
        position: "absolute",
        left: "14px",
        top: "18px",
        whiteSpace: "nowrap",
        borderRadius: "999px",
        padding: "2px 8px",
        font: "600 11px/16px system-ui, sans-serif",
        background: agent.color,
        color: agent.text,
      },
      node,
    );
    label.textContent = agent.name;
    // Fan in from beyond the right half of the screen.
    const angle = ((a + 0.5) / plan.length - 0.5) * Math.PI;
    const offstage = () => {
      const reach = Math.hypot(innerWidth, innerHeight) * 0.6;
      return { target: -1, x: innerWidth / 2 + Math.cos(angle) * reach, y: innerHeight / 2 + Math.sin(angle) * reach };
    };
    return { agent, node, offstage, from: offstage(), to: offstage(), p: 1, ease: easeInOut, scale: 1 };
  });

  const renderCursors = () => {
    for (const c of cursors) {
      const a = resolve(c.from);
      const b = resolve(c.to);
      const t = c.ease(c.p);
      c.node.style.transform = `translate3d(${lerp(a.x, b.x, t)}px, ${lerp(a.y, b.y, t)}px, 0) scale(${c.scale})`;
    }
  };

  const move = (c, to, seconds, ease = easeInOut, update = () => {}) => {
    c.from = c.to;
    c.to = to;
    c.ease = ease;
    c.p = 0;
    return tween(seconds, (t) => {
      c.p = t;
      update(t);
    });
  };

  async function draw(c, { target, part }) {
    const { region, tile, box, badge } = part;
    const { node } = layers[target];
    const width = node.naturalWidth || node.offsetWidth;
    const height = node.naturalHeight || node.offsetHeight;
    box.style.borderColor = c.agent.color;
    Object.assign(badge.style, { background: c.agent.color, color: c.agent.text });

    await move(c, { target, x: region.x, y: region.y }, 0.7);
    c.scale = 0.85;
    box.style.visibility = "visible";
    const end = { target, x: region.x + region.w, y: region.y + region.h };
    await move(c, end, 0.45 + region.w * region.h * 0.00012, easeInOut, (t) => {
      const e = easeInOut(t);
      box.style.width = `${e * region.w}%`;
      box.style.height = `${e * region.h}%`;
      badge.textContent = `${Math.round((e * region.w * width) / 100)} × ${Math.round((e * region.h * height) / 100)}`;
    });
    c.scale = 1;
    await tween(0.45, (t) => (tile.style.clipPath = inset(region, easeOut(t) * region.h)));
    tween(0.25, (t) => (box.style.opacity = String(1 - t))).catch(() => {});
  }

  async function run() {
    const images = layers.map(({ node }) => node).filter((n) => n instanceof HTMLImageElement);
    let timer;
    await Promise.race([
      Promise.all(images.map((img) => img.decode().catch(() => {}))),
      new Promise((r) => (timer = setTimeout(r, 1000))),
    ]);
    clearTimeout(timer);
    if (state === "ended") throw ABORT;
    frame = requestAnimationFrame(tick);

    await Promise.all(
      cursors.map(async (c, a) => {
        await tween(a * 0.2);
        for (const i of plan[a]) await draw(c, tasks[i]);
      }),
    );
    const exits = cursors.map((c) => tween(0.2).then(() => move(c, c.offstage(), 0.9, easeIn)));
    await tween(0.4, (t) => layers.forEach(({ cover }) => (cover.style.opacity = String(1 - t))));
    await Promise.all(exits);
  }

  /** Removes everything the swarm added; `completed` decides whether onDone runs. */
  const end = (completed) => {
    if (state === "ended") return;
    state = "ended";
    cancelAnimationFrame(frame);
    active.forEach((tw) => tw.reject(ABORT));
    active.clear();
    cleanups.splice(0).forEach((fn) => fn());
    reveal();
    if (completed) onDone?.();
    resolveFinished();
  };

  const begin = () => {
    if (state !== "idle") return;
    state = "running";
    run().then(
      () => end(true),
      (error) => {
        if (error !== ABORT) console.error("swarm-build:", error);
        end(error !== ABORT);
      },
    );
  };

  if (start === "now") begin();
  else {
    const trigger = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trigger.disconnect();
          begin();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    items.forEach(({ node }) => trigger.observe(node));
    cleanups.push(() => trigger.disconnect());
  }

  return {
    finished,
    /** Jumps to the finished image and removes the swarm; onDone runs. */
    finish() {
      if (state === "idle") return end(true);
      if (state !== "running") return;
      done = true;
      [...active].forEach((tw) => settle(tw, 1));
    },
    /** Removes everything now, wherever the build is; onDone does not run. */
    destroy() {
      end(false);
    },
  };
}

/** Builds every element with a `data-swarm` attribute, each with its own swarm. */
export function swarmBuildAll(selector = "[data-swarm]", options) {
  return [...document.querySelectorAll(selector)].map((node) => swarmBuild(node, options));
}
