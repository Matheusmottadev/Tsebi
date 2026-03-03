"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { getMe } from "@/services/auth";
import { getOrCreateAnonId, identifyUser } from "@/lib/analytics";

export function IdentityBridge() {
  useEffect(() => {
    const anonId = getOrCreateAnonId();
    if (posthog?.__loaded) {
      posthog.register({ anon_id: anonId });
    }

    let cancelled = false;
    (async () => {
      const user = await getMe({ cache: "no-store" }).catch(() => null);
      if (cancelled || !user?.id) {
        window.localStorage.removeItem("tsebi.user_id");
        return;
      }
      window.localStorage.setItem("tsebi.user_id", user.id);
      await identifyUser(anonId, user.id);
      if (posthog?.__loaded) {
        posthog.identify(user.id, {
          email: user.email || "",
          name: user.name || "",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
