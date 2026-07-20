// frontend/src/theme.js
import { createTheme } from "@mui/material/styles";

/**
 * OTNT design tokens — single source of truth for the "calm SaaS security
 * product" visual language (Linear / Raycast / Tailscale / Vercel inspired).
 * Every component pulls colors/typography from here rather than
 * hardcoding hex values, so the whole app stays visually consistent.
 */
const tokens = {
  background: "#F6F7F4",
  primary: "#2D5BFF",
  accent: "#5B8DEF",
  success: "#2FB67C",
  danger: "#E35D6A",
  text: "#1F2937",
  textSecondary: "#6B7280",
  card: "#FFFFFF",
  border: "#E7E9EC",
};

const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: tokens.background, paper: tokens.card },
    primary: { main: tokens.primary },
    secondary: { main: tokens.accent },
    success: { main: tokens.success },
    error: { main: tokens.danger },
    text: { primary: tokens.text, secondary: tokens.textSecondary },
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily: '"Inter", "Manrope", -apple-system, sans-serif',
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: {
      fontWeight: 600,
      color: tokens.textSecondary,
      textTransform: "uppercase",
      fontSize: "0.72rem",
      letterSpacing: "0.06em",
    },
    body2: { color: tokens.textSecondary },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.border}`,
          boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 12,
          paddingLeft: 18,
          paddingRight: 18,
          boxShadow: "none",
        },
        containedPrimary: {
          "&:hover": { boxShadow: "none", backgroundColor: "#2449D6" },
        },
        outlinedError: {
          borderWidth: 1.5,
          "&:hover": { borderWidth: 1.5, backgroundColor: "rgba(227, 93, 106, 0.06)" },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 8, height: 8, backgroundColor: tokens.border },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
  },
});

export default theme;
export { tokens };
