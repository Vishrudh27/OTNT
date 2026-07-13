import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:3001',
  timeout: 15000
});

// Handshake
export const handshakeInit = (clientECDHPublicKey) =>
  API.post('/api/handshake/init', { clientECDHPublicKey });

// Create tunnel
export const createTunnel = (payload) =>
  API.post('/api/tunnel/create', payload);

// Status
export const getTunnelStatus = (tunnelId) =>
  API.get(`/api/tunnel/status/${tunnelId}`);

// Delete
export const deleteTunnel = (tunnelId) =>
  API.post('/api/tunnel/delete', { tunnelId });
