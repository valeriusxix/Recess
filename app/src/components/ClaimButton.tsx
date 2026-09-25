type ClaimButtonProps = {
  ready: boolean;
  busy?: boolean;
  onClaim: () => void;
};

export function ClaimButton({ ready, busy, onClaim }: ClaimButtonProps) {
  return (
    <button
      type="button"
      disabled={!ready || busy}
      onClick={onClaim}
      className="rounded bg-stone-900 px-3 py-2 text-sm text-[#f4f0e6] disabled:opacity-40"
    >
      {busy ? "Settling…" : "Claim"}
    </button>
  );
}
