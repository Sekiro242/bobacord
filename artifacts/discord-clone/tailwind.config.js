import typography from "@tailwindcss/typography";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    'primary-foreground': "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    'accent-foreground': "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
            borderRadius: {
                xl: "var(--radius-xl)",
                lg: "var(--radius-lg)",
                md: "var(--radius-md)",
                sm: "var(--radius-sm)",
            },
            fontFamily: {
                sans: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "sans-serif"],
                display: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "sans-serif"],
            },
            keyframes: {
                "pulse-glow": {
                    "0%, 100%": { opacity: 1, boxShadow: "0 0 15px rgba(139,92,246,0.3)" },
                    "50%": { opacity: 0.8, boxShadow: "0 0 25px rgba(139,92,246,0.5)" },
                },
                "slide-up": {
                    "0%": { transform: "translateY(10px)", opacity: 0 },
                    "100%": { transform: "translateY(0)", opacity: 1 },
                },
                "float": {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-5px)" },
                }
            },
            animation: {
                "pulse-glow": "pulse-glow 2s ease-in-out infinite",
                "slide-up": "slide-up 0.3s ease-out forwards",
                "float": "float 3s ease-in-out infinite",
            }
        },
    },
    plugins: [typography, animate],
}

