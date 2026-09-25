type StockSelectorProps = {
  symbol: string;
};

export function StockSelector({ symbol }: StockSelectorProps) {
  return (
    <label className="flex flex-col text-sm">
      Stock
      <select defaultValue={symbol} className="mt-1 rounded border border-stone-300 bg-white px-2 py-1">
        <option value={symbol}>{symbol}</option>
      </select>
    </label>
  );
}
