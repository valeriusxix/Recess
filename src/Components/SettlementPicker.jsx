import { useSettlement } from "../hooks/useSettlement";

function SettlementPicker() {
  const { options, selected, choose } = useSettlement();

  return (
    <fieldset className="window-choice settlement-choice">
      <legend>Deposit and pay in</legend>
      {options.map((option) => (
        <label key={option.id}>
          <input
            checked={selected.id === option.id}
            name="settlement"
            type="radio"
            onChange={() => choose(option.id)}
          />
          <span>
            <strong>{option.symbol}</strong>
            {option.poolAddress
              ? "This token has its own pool. Deposits, premiums, and claims stay in that pool."
              : `Add ${option.envName} after that pool is deployed. Nothing in ${option.symbol} is sent until then.`}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export default SettlementPicker;
