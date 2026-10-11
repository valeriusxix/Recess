import { usePoolState } from "../hooks/usePoolState";
import { useSettlement } from "../hooks/useSettlement";

function DemoReleaseNote() {
  const { pool, error } = usePoolState();
  const { selected } = useSettlement();
  if (pool?.demoMode === false) return null;

  let text = "This release is demo only. Live reporter settlement is the same pool, a few days from now.";
  if (pool?.demoMode === true) {
    text = "This release is demo only. The pool authority sets the open and close prints, and a claim can be sent before the window ends.";
  } else if (!selected.poolAddress) {
    text = `This release is demo only. Add ${selected.envName} after the ${selected.symbol} pool is deployed. Nothing in ${selected.symbol} is sent until then.`;
  } else if (error) {
    return null;
  }

  return (
    <p className="release-note" role="status">{text}</p>
  );
}

export default DemoReleaseNote;
