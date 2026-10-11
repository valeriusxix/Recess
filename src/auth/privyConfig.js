export const privyAppId = String(import.meta.env.VITE_PRIVY_APP_ID || "").trim();

export const privyConfig = {
  loginMethods: ["email", "google"],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
    solana: {
      createOnLogin: "off",
    },
  },
};
