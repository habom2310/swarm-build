# swarm-build

A swarm of named, coloured cursors builds an image region by region, like a multiplayer design file.
Each cursor drags out a box with a live `W × H` badge, and that part of the image sweeps in.

- One dependency-free ES module, about 400 lines. No build step.
- Works with plain HTML and any framework.
- Respects `prefers-reduced-motion`, works under a strict CSP and Trusted Types, and cleans up after itself.
- Not on npm yet: copy the three files in `src/`.
- Ships an [Agent Skill](skills/swarm-build/SKILL.md) so Claude, Codex, Cursor or another coding agent can add it to a site and choose good regions.

## Quick start

```html
<link rel="stylesheet" href="swarm-build/src/swarm-build.css" />
<img src="shot.png" alt="..." width="1200" height="800"
     data-swarm-pending
     data-swarm-regions="0 0 18 100, 21 3.5 47 5.5, 21 13 24 16, 47 13 24 16" />
<script type="module">
  import { swarmBuild } from "./swarm-build/src/swarm-build.js";
  swarmBuild(document.querySelector("img[data-swarm-regions]"));
</script>
```

Each region is `x y w h` in percent of the image, built in the order given.
See [examples/index.html](examples/index.html) for a runnable demo.

## API

```js
const swarm = swarmBuild(targets, options);
await swarm.finished; // or swarm.finish(), swarm.destroy()
```

- `targets`: an element, `{ el, regions?, src? }`, or an array of them (one swarm across several images).
- `options`: `agents`, `speed`, `start` (`"visible"` or `"now"`), `canvas`, `zIndex`, `onDone`.
- `swarmBuildAll(selector = "[data-swarm]")` starts one swarm per matching element.

Types are in [src/swarm-build.d.ts](src/swarm-build.d.ts), and the full guide is in the [skill](skills/swarm-build/SKILL.md).

## Using it with a coding agent

- Claude Code: copy `skills/swarm-build/` into `~/.claude/skills/` (or the project's `.claude/skills/`), then ask "add swarm-build to the hero image".
- Other agents: point them at `skills/swarm-build/SKILL.md`, or copy it into the project's `AGENTS.md`.

## Run the demo and tests

```bash
python3 -m http.server 4310
```

Then open http://localhost:4310/examples/.

```bash
npm test
```

## Credit

The idea of a page built by a swarm of cursors comes from [Swarm](https://califa.github.io/swarm-site/) by [Joel Califa](https://joelcalifa.com).
This is an independent implementation and contains none of its code.

## License

MIT
