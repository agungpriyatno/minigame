"use client";

import dynamic from "next/dynamic";

const PosePong = dynamic(() => import("./PosePongGame"), { ssr: false });

export default function PosePongClientWrapper() {
  return <PosePong />;
}
