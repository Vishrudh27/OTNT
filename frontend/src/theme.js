// frontend/src/theme.js
import { createTheme } from "@mui/material/styles";

const tokens = {
  background: "#F8F8F6",
  card: "#FFFFFF",
  border: "#E6E8EB",
  primary: "#3B82F6",
  textSecondary: "#64748B",
  success: "#10B981",
  danger: "#EF4444",
  text: "#1F2937",
  softShadow: "0 6px 20px rgba(15,23,42,0.05)",
};

const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: tokens.background, paper: tokens.card },
    primary: { main: tokens.primary },
    success: { main: tokens.success },
    error: { main: tokens.danger },
    text: { primary: tokens.text, secondary: tokens.textSecondary },
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Inter", -apple-system, sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: {
      fontWeight: 600,
      color: tokens.textSecondary,
      textTransform: "uppercase",
      fontSize: "0.7rem",
      letterSpacing: "0.06em",
    },
    body2: { color: tokens.textSecondary },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.softShadow,
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, borderRadius: 12, boxShadow: "none" },
        containedPrimary: { "&:hover": { boxShadow: "none", backgroundColor: "#2563EB" } },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 8, height: 8, backgroundColor: tokens.border } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } } },
  },
});

export default theme;
export { tokens };
