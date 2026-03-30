import { Suspense } from "react";
import ReviewPage from "@/pages/ReviewPage";

export default function ReviewRoute() {
  return (
    <Suspense>
      <ReviewPage />
    </Suspense>
  );
}
