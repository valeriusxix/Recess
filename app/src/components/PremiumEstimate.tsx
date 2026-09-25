type PremiumEstimateProps = {
  premiumUsdc: string;
  referencePrice: string;
};

export function PremiumEstimate({ premiumUsdc, referencePrice }: PremiumEstimateProps) {
  return (
    <p className="text-lg">
      Premium {premiumUsdc} USDC · reference {referencePrice}
    </p>
  );
}
