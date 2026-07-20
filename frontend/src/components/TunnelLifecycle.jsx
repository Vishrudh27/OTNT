// frontend/src/components/TunnelLifecycle.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { KeyRound, Network, FileLock2, Wifi, Timer } from "lucide-react";
import { tokens } from "../theme";

/**
 * Bottom lifecycle timeline. HONEST NOTE: this is a UI-state indicator, not
 * a live network probe. "Connected" reflects that a config has been
 * delivered to the client, not a verified live WireGuard handshake — that
 * would require the status endpoint to expose peer handshake age from
 * `wg show`, which it currently doesn't. Fine for a demo/orientation aid;
 * don't cite this as evidence of a live connection in the write-up.
 */
const STAGES = [
  { key: "handshake", label: "Handshake", icon: KeyRound },
  { key: "created", label: "Tunnel Created", icon: Network },
  { key: "config", label: "Encrypted Config", icon: FileLock2 },
  { key: "connected", label: "Connected", icon: Wifi },
  { key: "destroy", label: "Auto Destroy", icon: Timer },
];

export default function TunnelLifecycle({ handshakeDone, tunnelCreated, configReady, connected }) {
  const doneMap = {
    handshake: handshakeDone,
    created: tunnelCreated,
    config: configReady,
    connected: connected,
    destroy: false,
  };

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: "18px", mt: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const done = doneMap[stage.key];
          const isLast = i === STAGES.length - 1;
          return (
            <React.Fragment key={stage.key}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 92 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: done ? tokens.success : tokens.background,
                    border: `1.5px solid ${done ? tokens.success : tokens.border}`,
                    transition: "all 0.3s ease",
                  }}
                >
                  <Icon size={18} color={done ? "#fff" : tokens.textSecondary} />
                </Box>
                <Typography
                  variant="body2"
                  sx={{ mt: 1, fontWeight: 600, color: done ? tokens.text : tokens.textSecondary, textAlign: "center" }}
                >
                  {stage.label}
                </Typography>
                {stage.key === "destroy" && (
                  <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
                    waiting…
                  </Typography>
                )}
              </Box>
              {!isLast && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    minWidth: 24,
                    bgcolor: done ? tokens.success : tokens.border,
                    borderRadius: 2,
                    transition: "all 0.3s ease",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Box>
    </Paper>
  );
}
