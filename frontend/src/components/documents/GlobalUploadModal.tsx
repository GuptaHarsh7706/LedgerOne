"use client";

import React, { useState, useEffect } from "react";
import { UploadModal } from "./UploadModal";

export function GlobalUploadModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-upload-modal", handleOpen);
    return () => window.removeEventListener("open-upload-modal", handleOpen);
  }, []);

  return (
    <UploadModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onUploadSuccess={() => {
        // Dispatched success
      }}
    />
  );
}
