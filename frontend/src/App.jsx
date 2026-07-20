// frontend/src/App.jsx
import React, { useState } from "react";
import { ThemeProvider, CssBaseline, Box, Container, Typography } from "@mui/material";
import { Wifi } from "lucide-react";
import theme, { tokens } from "./theme";
import TunnelForm from "./components/TunnelForm";
import TunnelStatus from "./components/TunnelStatus";
import DownloadEncryptedConfig from "./components/DownloadEncryptedConfig";
import SecureSessionCard from "./components/SecureSessionCard";
import TunnelLifecycle from "./components/TunnelLifecycle";

export default function App() {
  const [activeTunnel, setActiveTunnel] = useState(null);
  const [configReady, setConfigReady] = useState(false);

  const handleTunnelCreated = (tunnelData) => {
    setConfigReady(false);
    setActiveTunnel(tunnelData);
  };
  const handleTunnelDeleted = () => {
    setActiveTunnel(null);
    setConfigReady(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: tokens.background }}>
        <Box
          sx={{
            borderBottom: `1px solid ${tokens.border}`,
            bgcolor: tokens.card,
            px: 4,
            py: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>OTNT</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSecondary }}>
              Secure Ephemeral Tunnel Manager
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: activeTunnel ? tokens.success : tokens.textSecondary,
                boxShadow: activeTunnel ? `0 0 0 3px rgba(47,182,124,0.18)` : "none",
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {activeTunnel ? "Tunnel Live" : "Idle"}
            </Typography>
            <Wifi size={15} color={tokens.textSecondary} style={{ marginLeft: 4 }} />
          </Box>
        </Box>

        <Container sx={{ py: 5 }}>
          <Box sx={{ display: "flex", gap: 4, alignItems: "flex-start", flexWrap: "wrap" }}>
            <SecureSessionCard
              visible={!!activeTunnel}
              clientPublicKey={activeTunnel?.clientWG?.publicKey}
              serverPublicKey={activeTunnel?.serverECDHPublicKey}
            />

            <Box sx={{ flex: 1, minWidth: 300 }}>
              {!activeTunnel && <TunnelForm onTunnelCreated={handleTunnelCreated} />}

              {activeTunnel && (
                <Box>
                  <TunnelStatus
                    tunnelId={activeTunnel.tunnelId}
                    onTunnelDeleted={handleTunnelDeleted}
                  />
                  <DownloadEncryptedConfig
                    tunnelId={activeTunnel.tunnelId}
                    clientPrivateKey={activeTunnel.clientWG?.privateKey}
                    onConfigReady={() => setConfigReady(true)}
                  />
                </Box>
              )}
            </Box>
          </Box>

          {activeTunnel && (
            <TunnelLifecycle
              handshakeDone={!!activeTunnel}
              tunnelCreated={!!activeTunnel}
              configReady={configReady}
              connected={configReady}
            />
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
