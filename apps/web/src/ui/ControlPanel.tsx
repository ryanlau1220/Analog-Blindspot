import type { Dispatch, ReactNode } from "react";
import type { Site, SiteId } from "../data/types";
import { EXAGGERATIONS, type SceneAction, type SceneState } from "../scene/state";

const SITE_LABELS: Record<SiteId, string> = {
  moon: "Moon · Marius Hills Pit",
  earth: "Earth · Lava Beds",
  lanzarote: "Earth · Lanzarote",
};

function Seg({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs transition ${
        active ? "bg-zinc-100 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function ControlPanel({
  sites,
  site,
  state,
  dispatch,
}: {
  /** only sites present in sites.json (validated data) are offered */
  sites: Site[];
  site: Site;
  state: SceneState;
  dispatch: Dispatch<SceneAction>;
}) {
  return (
    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg bg-black/65 px-4 py-3 backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-3xl">
      <Group title="Site">
        {sites.map((s) => (
          <Seg
            key={s.id}
            testId={`site-${s.id}`}
            active={state.site === s.id}
            onClick={() => dispatch({ type: "selectSite", site: s.id })}
          >
            {SITE_LABELS[s.id]}
          </Seg>
        ))}
      </Group>

      <Group title={site.variants.length > 1 ? "Elevation grid" : "Elevation grid (single product)"}>
        {site.variants.map((v) => (
          <Seg
            key={v.id}
            testId={`variant-${v.id}`}
            active={state.variantId === v.id}
            onClick={() => dispatch({ type: "selectVariant", variantId: v.id })}
          >
            {v.resolution_m} m{v.observed ? " · observed" : " · simulated"}
          </Seg>
        ))}
      </Group>

      <Group title="Vertical scale">
        {EXAGGERATIONS.map((e) => (
          <Seg
            key={e}
            active={state.exaggeration === e}
            onClick={() => dispatch({ type: "setExaggeration", value: e })}
          >
            ×{e}
          </Seg>
        ))}
      </Group>

      {site.drape && (
        <Group title="Surface">
          <Seg
            active={state.drape === "relief"}
            onClick={() => dispatch({ type: "setDrape", drape: "relief" })}
          >
            Relief
          </Seg>
          <Seg
            active={state.drape === "orthophoto"}
            onClick={() => dispatch({ type: "setDrape", drape: "orthophoto" })}
          >
            Orthophoto
          </Seg>
        </Group>
      )}

      <Group title="Cutaway (east–west section)">
        <Seg
          testId="cutaway-toggle"
          active={state.cutaway.enabled}
          onClick={() => dispatch({ type: "toggleCutaway" })}
        >
          {state.cutaway.enabled ? "On" : "Off"}
        </Seg>
        <input
          aria-label="Cut position, north to south"
          type="range"
          min={0}
          max={1}
          step={0.002}
          disabled={!state.cutaway.enabled}
          value={state.cutaway.position}
          onChange={(e) => dispatch({ type: "setCutPosition", position: Number(e.target.value) })}
          className="w-36 accent-amber-300 disabled:opacity-30"
        />
      </Group>
    </div>
  );
}
