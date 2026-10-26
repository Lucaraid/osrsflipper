"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-lg font-semibold">Unexpected error</h1>
      <p className="mt-1 text-sm text-muted">This page could not be displayed. Your locally saved data is not affected.</p>
      <Button className="mt-3" onClick={reset}>Try again</Button>
    </div>
  );
}
