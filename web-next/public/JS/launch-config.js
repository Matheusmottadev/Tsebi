(() => {
  // Single source of truth for launch behavior toggles.
  window.TSEBI_LAUNCH_CONFIG = Object.freeze({
    // Allowed values: "prelaunch" | "launch"
    mode: "prelaunch"
  });

  // Backward-compatible flag already used by existing frontend code.
  window.TSEBI_PRELAUNCH_MODE = window.TSEBI_LAUNCH_CONFIG.mode !== "launch";
})();
