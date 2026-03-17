import PosePongClientWrapper from "./PosePongClientWrapper";

export const metadata = {
  title: "Pose Pong",
};

export default function PosePongPage() {
  return (
    <main className="min-h-screen bg-black overflow-hidden relative font-sans">
      <PosePongClientWrapper />
    </main>
  );
}
