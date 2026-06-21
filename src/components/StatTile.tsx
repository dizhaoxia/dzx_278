interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}

export default function StatTile({ label, value, hint, accent }: StatTileProps) {
  return (
    <div className="panel-inset flex flex-col gap-1 px-3 py-2.5">
      <span className="label">{label}</span>
      <span className={accent ? "value text-signal" : "value"}>{value}</span>
      {hint ? <span className="font-mono text-[10px] text-fg-faint">{hint}</span> : null}
    </div>
  );
}
