// frontend/src/App.jsx
import React, { useState } from "react";
import { Container, Typography, Box } from "@mui/material";
import TunnelForm from "./components/TunnelForm";
import TunnelStatus from "./components/TunnelStatus";
import DownloadEncryptedConfig from "./components/DownloadEncryptedConfig";

export default function App() {
  const [activeTunnel, setActiveTunnel] = useState(null);

  // Called after tunnel creation. `tunnelData.clientWG` carries the
  // WireGuard keypair TunnelForm generated locally in the browser —
  // { privateKey, publicKey } — both base64-encoded. Only the PUBLIC half
  // was ever sent to the backend (as `peerPublicKey`); the PRIVATE half
  // lives only in this app's memory for the lifetime of the tab.
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
            {/*
              SECURITY-CRITICAL: clientPrivateKey is the private half of the
              WireGuard keypair generated in TunnelForm.jsx. It has never
              left the browser and never will — it is only used here to
              complete the config file locally, after the server's encrypted
              template (with a placeholder in place of the private key) has
              been decrypted. This is what keeps the downloaded config in
              sync with the peer actually registered on the server's
              WireGuard interface.
            */}
            <DownloadEncryptedConfig
              tunnelId={activeTunnel.tunnelId}
              clientPrivateKey={activeTunnel.clientWG?.privateKey}
            />
          </Box>
        </Box>
      )}
    </Container>
  );
}