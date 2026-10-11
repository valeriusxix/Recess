import { useEffect, useState } from "react";

export function useQuotes() {
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/recess/quotes")
      .then((response) => response.json())
      .then((body) => {
        if (!live) return;
        setQuotes(body);
        setError(body?.error || "");
      })
      .catch(() => {
        if (live) setError("The price feed did not respond.");
      });
    return () => {
      live = false;
    };
  }, []);

  return { quotes, error };
}

export function shownPrice(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
