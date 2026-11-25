"use client";

import { CircleCheck, CircleAlert, TriangleAlert, Info } from "lucide-react";
import { Toaster as Sonner } from "sonner";

/** One viewport for the entire app; survives client-side navigation. */
export function Toaster() {
  return (
    <Sonner
      theme="system"
      position="bottom-right"
      closeButton
      expand
      visibleToasts={3}
      offset={24}
      mobileOffset={16}
      gap={12}
      containerAriaLabel="Action notifications"
      icons={{
        success: <CircleCheck />,
        error: <CircleAlert />,
        warning: <TriangleAlert />,
        info: <Info />,
      }}
      toastOptions={{
        classNames: {
          toast: "app-notice",
          title: "app-notice-title",
          description: "app-notice-description",
          closeButton: "app-notice-close",
        },
      }}
    />
  );
}
