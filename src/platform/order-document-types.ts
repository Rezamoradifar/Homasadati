export type OrderDocumentData = {
  order: {
    id: string;
    title: string;
    vertical: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    vatToman: number;
    payableToman: number;
    status: string;
    paymentMethod: string;
    paymentRef: string | null;
    createdAt: string;
    paidAt: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
    source: "snapshot" | "current_profile";
  };
  shipping: {
    label: string;
    country: string;
    city: string;
    postalCode: string;
    address: string;
  } | null;
};
