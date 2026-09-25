const TIERS = [200, 500, 1000] as const;

type ThresholdSelectorProps = {
  thresholdBps: number;
  onChange: (thresholdBps: number) => void;
};

export function ThresholdSelector({ thresholdBps, onChange }: ThresholdSelectorProps) {
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="mb-2 w-full text-sm">Downside threshold</legend>
      {TIERS.map((bps) => (
        <label key={bps} className="flex items-center gap-2 rounded border border-stone-300 px-3 py-2">
          <input
            type="radio"
            name="threshold"
            value={bps}
            checked={bps === thresholdBps}
            onChange={() => onChange(bps)}
          />
          {bps / 100}%
        </label>
      ))}
    </fieldset>
  );
}
