export type Order = {
  date: string;
  client: string;
  quantity: string;
  product: string;
  category: string | null;
};

export type ConciseOrder = Pick<Order, "client" | "product" | "quantity">;
