// frontend/src/App.jsx
import React, { useState } from "react";
import { Container, Typography, Box } from "@mui/material";
import TunnelForm from "./components/TunnelForm";
import TunnelStatus from "./components/TunnelStatus";
import DownloadEncryptedConfig from "./components/DownloadEncryptedConfig";

export default function App() {
  const [activeTunnel, setActiveTunnel] = useState(null);

  // Called after tunnel creation
  const handleTunnelCreated = (tunnelData) => {
    setActiveTunnel(tunnelData);
  };

  const handleTunnelDeleted = () => {
    setActiveTunnel(null);
  };

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" align="center" gutterBottom>
        OTNT Dashboard
      </Typography>

      {/* Show Tunnel Form when no tunnel */}
      {!activeTunnel && <TunnelForm onTunnelCreated={handleTunnelCreated} />}

      {/* Show Status + Download when tunnel is active */}
      {activeTunnel && (
        <Box sx={{ mt: 4 }}>
          <TunnelStatus
            tunnelId={activeTunnel.tunnelId}
            onTunnelDeleted={handleTunnelDeleted}
          />

          <Box sx={{ mt: 3, textAlign: "center" }}>
            {/* ✅ Pass tunnelId into DownloadEncryptedConfig */}
            <DownloadEncryptedConfig tunnelId={activeTunnel.tunnelId} />
          </Box>
        </Box>
      )}
    </Container>
  );
}
