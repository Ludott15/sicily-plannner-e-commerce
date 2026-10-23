"use client";

import { useEffect } from "react";
import { clearCart } from "@/server/shop/cart-actions";

// Svuota il carrello quando arriva la pagina di esito (passo 7.2): il cookie si può cambiare solo in
// un'azione del server, quindi la chiamata parte dal client al primo montaggio. Non mostra nulla.
export function ClearCart() {
  useEffect(() => {
    void clearCart();
  }, []);
  return null;
}
