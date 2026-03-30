import { Suspense } from "react";
import ReviewGuestPage from "@/pages/ReviewGuestPage";

export default function ReviewGuestRoute() {
  return (
    <Suspense>
      <ReviewGuestPage />
    </Suspense>
  );
}
