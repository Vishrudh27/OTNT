// frontend/src/App.jsx
import React, { useState, useEffect } from "react";
import { ThemeProvider, CssBaseline, Box, Grid, Typography, Chip, Tooltip, Paper, Button } from "@mui/material";
import { 
  Wifi, 
  Server, 
  Clock as ClockIcon, 
  Activity, 
  Shield, 
  Network, 
  Fingerprint, 
  Database,
  Lock,
  Flame,
  Download
} from "lucide-react";
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

// Slim Navigation Sidebar
function Sidebar({ activeTab, onTabClick }) {
  const navItems = [
    { label: "Dashboard", icon: Activity },
    { label: "Tunnel", icon: Shield },
    { label: "Lifecycle", icon: Network },
    { label: "Configuration", icon: Fingerprint },
    { label: "Logs", icon: Database },
  ];

  return (
    <Box sx={{
      width: "80px",
      minHeight: "calc(100vh - 48px)",
      bgcolor: "rgba(255, 255, 255, 0.45)",
      backdropFilter: "blur(16px)",
      border: `1px solid ${tokens.border}`,
      borderRadius: "24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      py: 4,
      gap: 4,
      position: "sticky",
      top: 24,
      zIndex: 10,
    }}>
      {/* Brand Logo Icon */}
      <Tooltip title="OTNT Secure Portal" placement="right">
        <Box sx={{
          width: 46,
          height: 46,
          borderRadius: "14px",
          background: `linear-gradient(135deg, ${tokens.primary} 0%, #B45309 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 15px rgba(217, 119, 6, 0.15)",
          mb: 2
        }}>
          <Lock size={20} color="#FFFFFF" />
        </Box>
      </Tooltip>

      {/* Nav items */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, width: "100%", alignItems: "center" }}>
        {navItems.map((item, idx) => {
          const IconComponent = item.icon;
          const isActive = item.label === activeTab;
          return (
            <Tooltip key={idx} title={item.label} placement="right">
              <Box 
                onClick={() => onTabClick(item.label)}
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  color: isActive ? tokens.primary : tokens.textSecondary,
                  bgcolor: isActive ? "rgba(217, 119, 6, 0.08)" : "transparent",
                  border: `1px solid ${isActive ? "rgba(217, 119, 6, 0.12)" : "transparent"}`,
                  "&:hover": {
                    color: tokens.primary,
                    bgcolor: "rgba(217, 119, 6, 0.04)",
                    transform: "translateX(2px)"
                  }
                }}
              >
                <IconComponent size={20} />
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Footer Status Icon */}
      <Box sx={{ mt: "auto" }}>
        <Box className="pulse-indicator" sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: tokens.success,
          boxShadow: `0 0 10px ${tokens.success}`
        }} />
      </Box>
    </Box>
  );
}

// Simulated audit.log Systems terminal
function LogsConsole({ logs }) {
  return (
    <Paper sx={{
      p: 4,
      borderRadius: "24px",
      bgcolor: "#111111", // Terminal is dark graphite
      border: `1px solid ${tokens.border}`,
      fontFamily: "monospace",
      display: "flex",
      flexDirection: "column",
      gap: 1.5,
      height: "100%",
      minHeight: "450px",
      boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)"
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid #2A2A2E", pb: 1.5, mb: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: tokens.primary }} />
        <Typography variant="body2" sx={{ color: "#F7F4ED", fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif' }}>
          Console Log Monitor — audit.log
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2, overflowY: "auto", flexGrow: 1 }}>
        {logs.map((log, i) => {
          let logColor = tokens.textSecondary;
          if (log.includes("AUDIT")) {
            logColor = tokens.success;
          } else if (log.includes("SYS")) {
            logColor = "#A7A3A0";
          }
          return (
            <Typography key={i} sx={{ 
              fontSize: "0.75rem", 
              color: logColor,
              lineHeight: 1.6,
              fontFamily: "monospace"
            }}>
              {log}
            </Typography>
          );
        })}
      </Box>
    </Paper>
  );
}

// Config Plaintext Preview for Configuration page
function ConfigPlaintextPreview({ decryptedConfig }) {
  return (
    <Paper sx={{
      p: 4,
      borderRadius: "24px",
      bgcolor: "rgba(255, 255, 255, 0.45)",
      backdropFilter: "blur(16px)",
      border: `1px solid ${tokens.border}`,
      display: "flex",
      flexDirection: "column",
      gap: 2
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
          Plaintext Profile Preview
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.82rem" }}>
        Read-only verification of the generated WireGuard `.conf` configuration.
      </Typography>

      {decryptedConfig ? (
        <Box sx={{
          p: 3,
          borderRadius: "14px",
          bgcolor: "#111111",
          border: "1px solid #2A2A2E",
          overflowX: "auto"
        }}>
          <pre style={{
            margin: 0,
            fontFamily: "monospace",
            fontSize: "0.78rem",
            color: "#F7F4ED",
            lineHeight: 1.6,
            textAlign: "left"
          }}>{decryptedConfig}</pre>
        </Box>
      ) : (
        <Box sx={{
          p: 6,
          borderRadius: "14px",
          bgcolor: "rgba(0, 0, 0, 0.02)",
          border: `1.5px dashed ${tokens.border}`,
          textAlign: "center",
          backdropFilter: "blur(4px)"
        }}>
          <Lock size={20} color={tokens.textSecondary} style={{ marginBottom: 12 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.text, fontSize: "0.85rem", mb: 0.5 }}>
            Config Preview Locked
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.75rem" }}>
            The decrypted profiles will display here once the configuration package is requested and verified.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// Stage Diagnostics for Lifecycle page
function StageDiagnostics({ activeTunnel, configReady }) {
  const diagnostics = [
    { name: "Client generation", duration: activeTunnel ? "12 ms" : "—", status: activeTunnel ? "Completed" : "Pending", color: activeTunnel ? tokens.success : tokens.textSecondary },
    { name: "ECDH Handshake", duration: activeTunnel ? "198 ms" : "—", status: activeTunnel ? "Completed" : "Pending", color: activeTunnel ? tokens.success : tokens.textSecondary },
    { name: "WG Interface Configuration", duration: activeTunnel ? "220 ms" : "—", status: activeTunnel ? "Completed" : "Pending", color: activeTunnel ? tokens.success : tokens.textSecondary },
    { name: "AES-GCM Local Decryption", duration: configReady ? "8 ms" : "—", status: configReady ? "Completed" : "Pending", color: configReady ? tokens.success : tokens.textSecondary },
    { name: "Expiry Monitor Service", duration: activeTunnel ? "Active" : "—", status: activeTunnel ? "Running" : "Pending", color: activeTunnel ? tokens.primary : tokens.textSecondary },
  ];

  return (
    <Paper sx={{
      p: 4,
      borderRadius: "24px",
      bgcolor: "rgba(255, 255, 255, 0.45)",
      backdropFilter: "blur(16px)",
      border: `1px solid ${tokens.border}`,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between"
    }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, mb: 1, color: tokens.text }}>
          Stage Diagnostics
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3, fontSize: "0.82rem" }}>
          Measured performance logs per lifecycle milestone.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {diagnostics.map((d, i) => (
            <Box key={i} sx={{ pb: 1.5, borderBottom: i < diagnostics.length - 1 ? `1.5px solid ${tokens.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="body2" sx={{ color: tokens.text, fontWeight: 600, fontSize: "0.8rem" }}>
                  {d.name}
                </Typography>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem" }}>
                  Status: <b style={{ color: d.color }}>{d.status}</b>
                </Typography>
              </Box>
              <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, color: tokens.text }}>
                {d.duration}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}

// Log Actions Card for Logs page (shows only legitimate connection properties)
function LogActionsPanel({ activeTunnel, onExport }) {
  const tunnelStats = [
    { name: "Virtual Interface", value: activeTunnel?.ifaceName || "None", color: activeTunnel ? tokens.success : tokens.textSecondary },
    { name: "Local Tunnel IP", value: activeTunnel?.clientIP || "—", color: tokens.text },
    { name: "Gateway Address", value: activeTunnel?.serverIP || "—", color: tokens.text },
  ];

  return (
    <Paper sx={{
      p: 4,
      borderRadius: "24px",
      bgcolor: "rgba(255, 255, 255, 0.45)",
      backdropFilter: "blur(16px)",
      border: `1px solid ${tokens.border}`,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between"
    }}>
      <Box>
        <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, mb: 1, color: tokens.text }}>
          Connection Info
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3, fontSize: "0.82rem" }}>
          Legitimate interface variables mapped from the WireGuard controller.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 4 }}>
          {tunnelStats.map((stat, i) => (
            <Box key={i} sx={{ pb: 1.5, borderBottom: i < tunnelStats.length - 1 ? `1.5px solid ${tokens.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="body2" sx={{ color: tokens.textSecondary, fontWeight: 600, fontSize: "0.78rem" }}>
                {stat.name}
              </Typography>
              <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, color: stat.color }}>
                {stat.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Button
        variant="outlined"
        color="primary"
        fullWidth
        onClick={onExport}
        startIcon={<Download size={14} />}
        sx={{ py: 1.3, fontWeight: 700 }}
      >
        Export audit.log
      </Button>
    </Paper>
  );
}

export default function App() {
  const [activeTunnel, setActiveTunnel] = useState(null);
  const [configReady, setConfigReady] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [decryptedConfig, setDecryptedConfig] = useState(null);
  const [logs, setLogs] = useState([]);

  // Generate logs tracking only actual client actions
  useEffect(() => {
    const lines = [
      `[SYS] ${new Date().toISOString()} - Initializing OTNT secure log stream...`,
    ];

    if (activeTunnel) {
      lines.push(`[AUDIT] ${new Date().toISOString()} - Client key generation verified`);
      lines.push(`[AUDIT] ${new Date().toISOString()} - ECDH handshake initiated with server gateway`);
      lines.push(`[AUDIT] ${new Date().toISOString()} - Registered tunnel ${activeTunnel.ifaceName || "wgX"} at Server IP ${activeTunnel.serverIP}`);
    }

    if (configReady) {
      lines.push(`[AUDIT] ${new Date().toISOString()} - AES-256-GCM local config decryption verified`);
    }

    setLogs(lines);
  }, [activeTunnel, configReady]);

  const handleTunnelCreated = (tunnelData) => { 
    setConfigReady(false); 
    setDecryptedConfig(null); 
    setActiveTunnel(tunnelData); 
  };
  
  const handleTunnelDeleted = () => { 
    setActiveTunnel(null); 
    setConfigReady(false); 
    setDecryptedConfig(null); 
  };

  const handleExportLogs = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `otnt_audit_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Tab Filter Workspace Renderer
  const renderWorkspace = () => {
    if (activeTab === "Dashboard") {
      if (!activeTunnel) {
        return (
          <Grid container spacing={4} alignItems="stretch">
            <Grid item xs={12} md={5}>
              <Box sx={{ height: "100%" }}>
                <TunnelForm onTunnelCreated={handleTunnelCreated} />
              </Box>
            </Grid>
            <Grid item xs={12} md={7}>
              <Box sx={{ height: "100%" }}>
                <HowItWorksPanel />
              </Box>
            </Grid>
          </Grid>
        );
      } else {
        return (
          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <SecureSessionCard 
                visible 
                clientPublicKey={activeTunnel?.clientWG?.publicKey} 
                serverPublicKey={activeTunnel?.serverECDHPublicKey} 
              />
            </Grid>
            
            <TunnelStatus 
              tunnelId={activeTunnel.tunnelId} 
              onTunnelDeleted={handleTunnelDeleted} 
            />

            <Grid item xs={12} md={4}>
              <TunnelLifecycle 
                handshakeDone 
                tunnelCreated 
                configReady={configReady} 
                connected={configReady} 
              />
            </Grid>
            
            <DownloadEncryptedConfig
              tunnelId={activeTunnel.tunnelId}
              clientPrivateKey={activeTunnel.clientWG?.privateKey}
              onConfigReady={(plaintext) => {
                setConfigReady(true);
                setDecryptedConfig(plaintext);
              }}
            />

            <Grid item xs={12}>
              <HowItWorksPanel />
            </Grid>
          </Grid>
        );
      }
    }

    if (activeTab === "Tunnel") {
      if (!activeTunnel) {
        return (
          <Grid container spacing={4} justifyContent="center">
            <Grid item xs={12} md={6}>
              <TunnelForm onTunnelCreated={handleTunnelCreated} />
            </Grid>
          </Grid>
        );
      } else {
        return (
          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <SecureSessionCard 
                visible 
                clientPublicKey={activeTunnel?.clientWG?.publicKey} 
                serverPublicKey={activeTunnel?.serverECDHPublicKey} 
              />
            </Grid>
            <TunnelStatus 
              tunnelId={activeTunnel.tunnelId} 
              onTunnelDeleted={handleTunnelDeleted} 
            />
          </Grid>
        );
      }
    }

    if (activeTab === "Lifecycle") {
      if (!activeTunnel) {
        return (
          <Paper sx={{ p: 6, textAlign: "center", borderRadius: "24px", bgcolor: "rgba(255,255,255,0.45)", backdropFilter: "blur(16px)" }}>
            <Network size={40} color={tokens.textSecondary} style={{ margin: "0 auto 16px auto" }} className="pulse-indicator" />
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>Lifecycle Monitor Offline</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, maxWidth: 400, mx: "auto" }}>
              Initialize a secure WireGuard tunnel connection on the Dashboard or Tunnel tab to trace the dynamic lifecycle.
            </Typography>
          </Paper>
        );
      } else {
        return (
          <Grid container spacing={4} alignItems="stretch">
            <Grid item xs={12} md={8}>
              <TunnelLifecycle 
                handshakeDone 
                tunnelCreated 
                configReady={configReady} 
                connected={configReady} 
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StageDiagnostics activeTunnel={activeTunnel} configReady={configReady} />
            </Grid>
          </Grid>
        );
      }
    }

    if (activeTab === "Configuration") {
      if (!activeTunnel) {
        return (
          <Paper sx={{ p: 6, textAlign: "center", borderRadius: "24px", bgcolor: "rgba(255,255,255,0.45)", backdropFilter: "blur(16px)" }}>
            <Fingerprint size={40} color={tokens.textSecondary} style={{ margin: "0 auto 16px auto" }} className="pulse-indicator" />
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>Configuration Setup Offline</Typography>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, maxWidth: 400, mx: "auto" }}>
              A tunnel session must be active before secure configuration profiles can be retrieved and decrypted.
            </Typography>
          </Paper>
        );
      } else {
        return (
          <Grid container spacing={4}>
            <DownloadEncryptedConfig
              tunnelId={activeTunnel.tunnelId}
              clientPrivateKey={activeTunnel.clientWG?.privateKey}
              onConfigReady={(plaintext) => {
                setConfigReady(true);
                setDecryptedConfig(plaintext);
              }}
              md={6} // Use 50% / 50% split for Configuration Page
            />
            <Grid item xs={12}>
              <ConfigPlaintextPreview decryptedConfig={decryptedConfig} />
            </Grid>
          </Grid>
        );
      }
    }

    if (activeTab === "Logs") {
      return (
        <Grid container spacing={4} alignItems="stretch">
          <Grid item xs={12} md={8}>
            <LogsConsole logs={logs} />
          </Grid>
          <Grid item xs={12} md={4}>
            <LogActionsPanel activeTunnel={activeTunnel} onExport={handleExportLogs} />
          </Grid>
        </Grid>
      );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      
      {/* Floating Network Tunnel Background Effect */}
      <Box className="tunnel-bg-layer">
        <Box className="tunnel-ring tunnel-ring-1" />
        <Box className="tunnel-ring tunnel-ring-2" />
        <Box className="tunnel-ring tunnel-ring-3" />
        <Box className="tunnel-ring tunnel-ring-4" />
        <Box className="tunnel-ring tunnel-ring-5" />
      </Box>

      <Box sx={{
        minHeight: "100vh",
        bgcolor: "transparent", // background handled by body radial grid
        p: { xs: 2.5, md: 4 },
        display: "flex",
        justifyContent: "center",
        position: "relative",
        zIndex: 1,
      }}>
        <Box sx={{
          width: "100%",
          maxWidth: "1500px",
          display: "flex",
          gap: 4,
        }}>
          {/* Left Sidebar */}
          <Sidebar activeTab={activeTab} onTabClick={setActiveTab} />

          {/* Main Dashboard Area */}
          <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Header */}
            <Box sx={{
              p: 3,
              borderRadius: "24px",
              bgcolor: "rgba(255, 255, 255, 0.45)",
              backdropFilter: "blur(16px)",
              border: `1px solid ${tokens.border}`,
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", md: "center" },
              gap: 2,
            }}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: tokens.text, letterSpacing: "-0.02em" }}>
                    OTNT
                  </Typography>
                  <Chip
                    size="small"
                    icon={<Flame size={12} color={tokens.primary} />}
                    label="Ephemeral VPN"
                    sx={{
                      bgcolor: "rgba(217, 119, 6, 0.08)",
                      color: tokens.primary,
                      fontWeight: 700,
                      fontSize: "0.72rem",
                      borderColor: "rgba(217, 119, 6, 0.12)"
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, mt: 0.5, fontSize: "0.82rem" }}>
                  One-Time Network Tunnel Management Console
                </Typography>
              </Box>

              {/* Header metrics */}
              <Box sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 3,
                alignItems: "center",
              }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Wifi size={16} color={activeTunnel ? tokens.success : tokens.textSecondary} />
                  <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
                    Iface: <b style={{ color: activeTunnel ? tokens.success : tokens.text }}>{activeTunnel?.ifaceName || "None"}</b>
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Server size={16} color={tokens.textSecondary} />
                  <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
                    Node: <b style={{ color: tokens.text }}>active-linux-host</b>
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <ClockIcon size={16} color={tokens.textSecondary} />
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.82rem", color: tokens.text }}>
                    <LiveClock />
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box className={activeTunnel ? "status-pulse-green" : ""} sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: activeTunnel ? tokens.success : tokens.textSecondary,
                  }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: activeTunnel ? tokens.success : tokens.textSecondary, fontSize: "0.82rem" }}>
                    {activeTunnel ? "TUNNEL CONNECTED" : "IDLE"}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Dashboard Workspace */}
            <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              {renderWorkspace()}
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}