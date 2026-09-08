
import axios from "axios";

// Base URL matches backend. Overridable via VITE_API_BASE (see .env.example).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:3001/api",
  headers: { "Content-Type": "application/json" }
});

// === API functions ===

// Handshake
export const handshakeInit = (clientECDHPublicKey) =>
  api.post("/handshake/init", { clientECDHPublicKey });

// Create tunnel
export const createTunnel = (payload) =>
  api.post("/tunnel/create", payload);

// Get tunnel status
export const getTunnelStatus = (tunnelId) =>
  api.get(`/tunnel/status/${tunnelId}`);

// Delete tunnel
export const deleteTunnel = (tunnelId) =>
  api.post("/tunnel/delete", { tunnelId });

export default api;
