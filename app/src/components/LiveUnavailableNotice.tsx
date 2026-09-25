type LiveUnavailableNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function LiveUnavailableNotice({ open, onClose }: LiveUnavailableNoticeProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4" role="presentation">
      <div
        role="alertdialog"
        aria-labelledby="live-unavailable"
        className="w-full max-w-sm rounded border border-stone-300 bg-[#f4f0e6] p-5 shadow-lg"
      >
        <p id="live-unavailable" className="text-lg">
          Live not available- Coming Soon
        </p>
        <button type="button" className="mt-4 rounded bg-stone-900 px-3 py-2 text-sm text-[#f4f0e6]" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
