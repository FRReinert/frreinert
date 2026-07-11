export type CartItem = {
  eventId: string;
  eventTitle: string;
  photoId: string;
  photoTitle: string;
  preview: string;
  /** Preço só para exibição no UI — o Worker recalcula no checkout. */
  price: number;
};

const STORAGE_KEY = 'frreinert-cart-v2';

export function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function readCart(): CartItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: { items } }));
}

export function cartItemKey(item: Pick<CartItem, 'eventId' | 'photoId'>) {
  return `${item.eventId}::${item.photoId}`;
}

export function addToCart(item: CartItem) {
  const items = readCart();
  const key = cartItemKey(item);
  if (items.some((i) => cartItemKey(i) === key)) return items;
  const next = [...items, item];
  writeCart(next);
  return next;
}

export function removeFromCart(eventId: string, photoId: string) {
  const next = readCart().filter((i) => !(i.eventId === eventId && i.photoId === photoId));
  writeCart(next);
  return next;
}

export function clearCart() {
  writeCart([]);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export function cartCount(items: CartItem[]) {
  return items.length;
}

/** Payload mínimo — preço/highresKey resolvidos no Worker. */
export type CheckoutPayload = {
  email: string;
  items: Array<{
    eventId: string;
    photoId: string;
  }>;
};

const LAST_ORDER_KEY = 'frreinert-last-order-v1';

export function saveLastOrder(ref: string, items: CartItem[], total: number) {
  localStorage.setItem(
    LAST_ORDER_KEY,
    JSON.stringify({
      ref,
      total,
      items: items.map((i) => ({
        eventId: i.eventId,
        photoId: i.photoId,
        title: `${i.eventTitle} — ${i.photoTitle}`,
        unitPrice: i.price,
      })),
    }),
  );
}

export function readLastOrder(ref: string) {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      ref: string;
      total: number;
      items: Array<{
        eventId: string;
        photoId: string;
        title: string;
        unitPrice: number;
      }>;
    };
    if (data.ref !== ref) return null;
    return data;
  } catch {
    return null;
  }
}
