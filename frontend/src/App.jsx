// frontend/src/App.jsx
import React, { useState, useEffect } from "react";
import { ThemeProvider, CssBaseline, Box, Container, Typography } from "@mui/material";
import { Wifi, Server, Clock as ClockIcon } from "lucide-react";
import theme, { tokens } from "./theme";
import TunnelForm from "./components/TunnelForm";
import TunnelStatus from "./components/TunnelStatus";
import DownloadEncryptedConfig from "./components/DownloadEncryptedConfig";
import SecureSessionCard from "./components/SecureSessionCard";
import TunnelLifecycle from "./components/TunnelLifecycle";
import HowItWorksPanel from "./components/HowItWorksPanel";

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{now.toLocaleTimeString()}</>;
}

export default function App() {
  const [activeTunnel, setActiveTunnel] = useState(null);
  const [configReady, setConfigReady] = useState(false);

  const handleTunnelCreated = (tunnelData) => { setConfigReady(false); setActiveTunnel(tunnelData); };
  const handleTunnelDeleted = () => { setActiveTunnel(null); setConfigReady(false); };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{
        minHeight: "100vh",
        bgcolor: tokens.background,
        backgroundImage: "radial-gradient(rgba(100,116,139,0.08) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}>
        {/* Header */}
        <Box sx={{ borderBottom: `1px solid ${tokens.border}`, bgcolor: tokens.card, px: 4, py: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>OTNT</Typography>
              <Typography variant="body2">Secure Ephemeral Tunnel Manager</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: activeTunnel ? tokens.success : tokens.textSecondary, boxShadow: activeTunnel ? "0 0 0 3px rgba(16,185,129,0.16)" : "none" }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{activeTunnel ? "Tunnel Active" : "Idle"}</Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 4, mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
              <Wifi size={13} color={tokens.textSecondary} />
              <Typography variant="body2">Interface: <b style={{ color: tokens.text }}>{activeTunnel?.ifaceName || "—"}</b></Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
              <Server size={13} color={tokens.textSecondary} />
              <Typography variant="body2">Server: <b style={{ color: tokens.text }}>Online</b></Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
              <ClockIcon size={13} color={tokens.textSecondary} />
              <Typography variant="body2"><LiveClock /></Typography>
            </Box>
          </Box>
        </Box>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          {/* Row 1 */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "380px 1fr" }, gap: 3, mb: 3, alignItems: "stretch" }}>
            {activeTunnel ? (
              <SecureSessionCard visible clientPublicKey={activeTunnel?.clientWG?.publicKey} serverPublicKey={activeTunnel?.serverECDHPublicKey} />
            ) : (
              <TunnelForm onTunnelCreated={handleTunnelCreated} />
            )}

            {activeTunnel ? (
              <TunnelStatus tunnelId={activeTunnel.tunnelId} onTunnelDeleted={handleTunnelDeleted} />
            ) : (
              <HowItWorksPanel />
            )}
          </Box>

          {/* Row 2 — only once a tunnel exists */}
          {activeTunnel && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
              <TunnelLifecycle handshakeDone tunnelCreated configReady={configReady} connected={configReady} />
              <DownloadEncryptedConfig
                tunnelId={activeTunnel.tunnelId}
                clientPrivateKey={activeTunnel.clientWG?.privateKey}
                onConfigReady={() => setConfigReady(true)}
              />
            </Box>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}