export async function simulateWrite(tx) {
  let response;
  try {
    response = await fetch("/api/recess/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value || "0x0",
      }),
    });
  } catch {
    return { blocked: true, message: "The simulation service did not respond. Nothing was sent." };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    return { blocked: true, message: "The simulation service returned an unreadable response. Nothing was sent." };
  }
  if (body.skipped) {
    return {
      blocked: false,
      warning: body.warning || "Simulation was skipped. The wallet can still send this transaction.",
    };
  }
  if (!body.ok) {
    return {
      blocked: true,
      message: body.message || "Simulation rejected this transaction. Nothing was sent.",
    };
  }
  return { blocked: false, warning: "" };
}
