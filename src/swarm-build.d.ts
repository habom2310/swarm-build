/** Part of an image, in percent of its width and height. */
export type Region = { x: number; y: number; w: number; h: number };

/** `text` is the label text colour, default white. */
export type Agent = { name: string; color: string; text?: string };

export type Target =
  | Element
  | {
      el: Element;
      /** Built in order. Defaults to `data-swarm-regions`, then a generic app layout. */
      regions?: Region[];
      /** Image URL. Defaults to the img's current source or the element's background image. */
      src?: string;
    };

export type Options = {
  /** Cursors, one per agent (up to the number of regions). */
  agents?: Agent[];
  /** 2 plays twice as fast. Default 1 (about 6-8s for 10-15 regions). */
  speed?: number;
  /** "visible" (default) waits until an image scrolls into view; "now" starts at once. */
  start?: "visible" | "now";
  /** Blank canvas color shown before a region is built. Default "#fff". */
  canvas?: string;
  /** z-index of the fixed cursor layer. */
  zIndex?: number;
  onDone?: () => void;
};

export type SwarmBuild = {
  /** Resolves once the image is complete and the swarm is gone. */
  finished: Promise<void>;
  /** Jump to the finished image. */
  finish(): void;
  /** Remove everything now (for example on unmount). */
  destroy(): void;
};

export const DEFAULT_AGENTS: Agent[];
export function swarmBuild(targets: Target | Target[], options?: Options): SwarmBuild;
export function swarmBuildAll(selector?: string, options?: Options): SwarmBuild[];
export function parseRegions(text: string): Region[];
export function autoRegions(): Region[];
export function assignTasks(taskCount: number, agentCount: number): number[][];
