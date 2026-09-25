type NetworkSwitchProps = {
  onMainnet: () => void;
};

export function NetworkSwitch({ onMainnet }: NetworkSwitchProps) {
  return (
    <div className="flex overflow-hidden rounded border border-stone-300 text-sm">
      <button type="button" aria-pressed="true" className="bg-stone-900 px-3 py-1 text-[#f4f0e6]">
        Devnet
      </button>
      <button type="button" className="bg-white px-3 py-1" onClick={onMainnet}>
        Mainnet
      </button>
    </div>
  );
}
