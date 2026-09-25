type DemoModeBadgeProps = {
  demoMode: boolean;
};

export function DemoModeBadge({ demoMode }: DemoModeBadgeProps) {
  if (!demoMode) return null;
  return (
    <div className="inline-block rounded bg-amber-300 px-2 py-1 text-xs font-bold tracking-widest text-amber-950">
      DEMO MODE
    </div>
  );
}
