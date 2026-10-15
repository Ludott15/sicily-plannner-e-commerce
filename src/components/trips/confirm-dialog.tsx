"use client";

import { Dialog, type DialogProps } from "@/components/ui/dialog";

// ConfirmDialog è il Dialog generico (src/components/ui/dialog.tsx) con la stessa API di prima:
// resta per gli usi nei viaggi (check-in, eliminazione, rimozione di un giorno).
export function ConfirmDialog(props: DialogProps) {
  return <Dialog {...props} />;
}
