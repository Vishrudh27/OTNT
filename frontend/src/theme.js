// frontend/src/theme.js
import { createTheme } from "@mui/material/styles";

const tokens = {
  background: "#F4F4F3",     // Warm Minimal Off-White
  card: "#FFFFFF",           // Pure White Card
  border: "#E5E5E2",         // Soft Gray Border
  primary: "#D97706",        // Copper Orange
  secondary: "#F59E0B",      // Amber Gold
  success: "#10B981",        // Emerald Highlight
  purple: "#8B5CF6",         // Secondary Highlight
  danger: "#EF4444",         // Crimson Red
  text: "#1C1917",           // Dark Slate Charcoal
  textSecondary: "#78716C",   // Warm Slate Gray
  softShadow: "0 10px 30px rgba(27, 26, 29, 0.05), 0 2px 4px rgba(27, 26, 29, 0.02)",
  glow: "0 0 20px rgba(217, 119, 6, 0.04)",
  glowStrong: "0 0 25px rgba(217, 119, 6, 0.08)",
};

const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: tokens.background, paper: tokens.card },
    primary: { main: tokens.primary },
    secondary: { main: tokens.secondary },
    success: { main: tokens.success },
    error: { main: tokens.danger },
    text: { primary: tokens.text, secondary: tokens.textSecondary },
  },
  shape: { borderRadius: 20 },
  typography: {
    fontFamily: '"Sora", -apple-system, sans-serif',
    h4: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 600,
      color: tokens.textSecondary,
      textTransform: "uppercase",
      fontSize: "0.7rem",
      letterSpacing: "0.06em",
    },
    body2: { color: tokens.textSecondary, lineHeight: 1.6 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.softShadow,
          backgroundColor: tokens.card,
          backgroundImage: "none",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            boxShadow: `0 15px 35px rgba(27, 26, 29, 0.08), ${tokens.glow}`,
            borderColor: "rgba(217, 119, 6, 0.18)",
          }
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 12,
          boxShadow: "none",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            transform: "scale(1.02)",
            boxShadow: "none"
          }
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${tokens.primary} 0%, #B45309 100%)`,
          color: "#FFFFFF",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(217, 119, 6, 0.2)",
            background: `linear-gradient(135deg, #B45309 0%, ${tokens.primary} 100%)`
          }
        },
        outlinedPrimary: {
          borderColor: tokens.primary,
          color: tokens.primary,
          "&:hover": {
            backgroundColor: "rgba(217, 119, 6, 0.04)",
            borderColor: tokens.secondary,
          }
        },
        outlinedError: {
          borderColor: "rgba(239, 68, 68, 0.2)",
          color: tokens.danger,
          "&:hover": {
            borderColor: tokens.danger,
            backgroundColor: "rgba(239, 68, 68, 0.04)",
          }
        }
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "rgba(0, 0, 0, 0.015)",
            borderRadius: 12,
            transition: "all 0.2s ease-in-out",
            "& fieldset": {
              borderColor: tokens.border,
            },
            "&:hover fieldset": {
              borderColor: "rgba(217, 119, 6, 0.3)",
            },
            "&.Mui-focused fieldset": {
              borderColor: tokens.primary,
              boxShadow: `0 0 10px rgba(217, 119, 6, 0.06)`,
            },
          },
          "& label.Mui-focused": {
            color: tokens.primary,
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 8,
          backgroundColor: "rgba(0, 0, 0, 0.04)",
        }
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.04)"
        }
      }
    },
  },
});

export default theme;
export { tokens };
