import "@rainbow-me/rainbowkit/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import {
  RainbowKitProvider,
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http } from "wagmi";
import { MezoChain } from "@mtools/shared";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient();
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "MezoRedeemerDemoId";
const wagmiConfig = getDefaultConfig({
  appName: "Mezo Redeemer",
  projectId,
  chains: [MezoChain],
  transports: {
    [MezoChain.id]: http(MezoChain.rpcUrls.default.http[0]),
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={MezoChain}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
