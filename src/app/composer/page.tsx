import { Suspense } from "react";
import ComposerPage from "@/pages/ComposerPage";

export default function ComposerRoute() {
  return (
    <Suspense>
      <ComposerPage />
    </Suspense>
  );
}
