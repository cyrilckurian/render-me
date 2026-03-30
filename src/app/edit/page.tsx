import { Suspense } from "react";
import EditPage from "@/pages/EditPage";

export default function EditRoute() {
  return (
    <Suspense>
      <EditPage />
    </Suspense>
  );
}
