import { TIERS } from "../lib/pricing";
import { formatThreshold } from "../lib/format";

function ThresholdPicker({ value, onChange, disabled = false }) {
  return (
    <div className="tier-picker" role="radiogroup" aria-label="Gap threshold">
      {TIERS.map((tier) => {
        const selected = tier.thresholdBps === value;
        return (
          <button
            aria-checked={selected}
            className={selected ? "tier-option is-selected" : "tier-option"}
            disabled={disabled}
            key={tier.thresholdBps}
            role="radio"
            type="button"
            onClick={() => onChange(tier.thresholdBps)}
          >
            <span>{formatThreshold(tier.thresholdBps)} gap</span>
            <small>{formatThreshold(tier.premiumBps)} of notional</small>
          </button>
        );
      })}
    </div>
  );
}

export default ThresholdPicker;
