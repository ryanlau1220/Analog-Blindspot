/** The three visual states of evidence used everywhere in the 3D scene. */
export function Legend({ compact = false }: { compact?: boolean }) {
  const items = [
    {
      key: "measured",
      swatch: <span className="inline-block h-0.5 w-6 rounded bg-[#5eead4]" />,
      label: "Measured surface",
    },
    {
      key: "nodata",
      swatch: (
        <span className="inline-block h-3 w-5 rounded-sm bg-[repeating-linear-gradient(45deg,#1a0b1a_0_2px,#e040c8_2px_4px)]" />
      ),
      label: "No elevation data",
    },
    {
      key: "unmeasured",
      swatch: (
        <span className="inline-block h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,#0d121c_0_3px,#3c4a60_3px_5px)]" />
      ),
      label: "Not measured (subsurface)",
    },
  ];
  return (
    <ul
      data-testid="legend"
      className={`flex flex-wrap gap-x-4 gap-y-1.5 ${compact ? "text-[11px]" : "text-xs"} text-zinc-200`}
    >
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2">
          {i.swatch}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
