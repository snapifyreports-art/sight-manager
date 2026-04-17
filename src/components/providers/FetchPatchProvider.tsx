"use client";

import { useEffect } from "react";
import { patchFetchNoStore } from "@/lib/patch-fetch";

let patched = false;

export function FetchPatchProvider() {
  useEffect(() => {
    if (!patched) {
      patchFetchNoStore();
      patched = true;
    }
  }, []);

  return null;
}
