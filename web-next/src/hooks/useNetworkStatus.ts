"use client";

import { useState, useEffect } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // mantém wasOffline=true por 3s para exibir "voltou online" antes de sumir
      setTimeout(() => setWasOffline(false), 3000);
    };
    const goOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
