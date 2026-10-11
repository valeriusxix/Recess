function AmountWarning({ checked, onChange, disabled = false, symbol = "USDT" }) {
  return (
    <label className="amount-warning">
      <input
        checked={checked}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>This amount is above 100 {symbol}. I still want to continue.</span>
    </label>
  );
}

export default AmountWarning;
