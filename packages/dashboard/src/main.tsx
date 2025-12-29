import "@rainbow-me/rainbowkit/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  RainbowKitProvider,
  darkTheme,
  type Theme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { MezoChain, MezoChainTestnet } from "@mtools/shared";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  chains: [MezoChain, MezoChainTestnet],
  connectors: [injected()],
  transports: {
    [MezoChain.id]: http(MezoChain.rpcUrls.default.http[0]),
    [MezoChainTestnet.id]: http(MezoChainTestnet.rpcUrls.default.http[0]),
  },
});

const baseRainbowTheme = darkTheme({
  accentColor: "#f04242",
  accentColorForeground: "#05070f",
  borderRadius: "large",
  overlayBlur: "small",
});

const rainbowTheme: Theme = {
  ...baseRainbowTheme,
  colors: {
    ...baseRainbowTheme.colors,
    accentColor: "#f04242",
    accentColorForeground: "#05070f",
    actionButtonSecondaryBackground: "rgba(7, 10, 18, 0.7)",
    connectButtonBackground: "rgba(4, 7, 15, 0.85)",
    connectButtonInnerBackground: "rgba(7, 10, 18, 0.85)",
    connectButtonText: "#f8fafc",
    connectButtonTextError: "#f04242",
    connectionIndicator: "#2894b8",
    error: "#f04242",
    generalBorder: "#1b2432",
    generalBorderDim: "rgba(27, 36, 50, 0.7)",
    menuItemBackground: "rgba(12, 17, 29, 0.8)",
    modalBackdrop: "rgba(7, 10, 18, 0.85)",
    modalBackground: "#0c111d",
    modalBorder: "#1b2432",
    modalText: "#f8fafc",
    modalTextDim: "rgba(128, 142, 163, 0.85)",
    modalTextSecondary: "#808ea3",
    profileForeground: "rgba(7, 10, 18, 0.85)",
    selectedOptionBorder: "#f04242",
    standby: "#2894b8",
  },
  fonts: {
    ...baseRainbowTheme.fonts,
    body: 'Inter, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
  },
  radii: {
    ...baseRainbowTheme.radii,
    actionButton: "999px",
    connectButton: "999px",
    menuButton: "20px",
    modal: "24px",
    modalMobile: "24px",
  },
  shadows: {
    ...baseRainbowTheme.shadows,
    connectButton: "0 10px 30px rgba(240, 66, 66, 0.25)",
    dialog: "0 40px 120px rgba(0, 0, 0, 0.65)",
    profileDetailsAction: "0 15px 40px rgba(0, 0, 0, 0.45)",
    selectedOption: "0 10px 30px rgba(255, 76, 76, 0.35)",
    selectedWallet: "0 15px 45px rgba(0, 0, 0, 0.6)",
    walletLogo: "0 8px 24px rgba(0, 0, 0, 0.5)",
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={MezoChain} theme={rainbowTheme}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
