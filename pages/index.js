import Head from "next/head";
import BuyerCompanion from "../components/BuyerCompanion";

export default function Home() {
  return (
    <>
      <Head>
        <title>Buyer Companion™ | LoanCert™</title>
        <meta name="description" content="LoanCert™ Buyer Companion — Independent Buyer Verification™" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <BuyerCompanion
        onComplete={(userId, sessionId, intake) => {
          // Future: POST to your backend here
          console.log("[LoanCert] Intake complete:", { userId, sessionId, intake });
        }}
        onStartVerify={(userId, sessionId, intake) => {
          // Floify handoff — handled inside BuyerCompanion already
          console.log("[LoanCert] Verification started:", { userId, sessionId });
        }}
      />
    </>
  );
}
