export type ListType = "shopping" | "wish" | "want";

export const LIST_TYPES: Record<ListType, { label: string; emoji: string; hint: string }> = {
  shopping: { label: "Handlingslista", emoji: "🛒", hint: "Bocka av när du handlar" },
  wish: { label: "Önskelista", emoji: "🎁", hint: "Vänner kan reservera presenter – utan att du ser vad" },
  want: { label: "Vill ha-lista", emoji: "✨", hint: "Spara saker du spanar på och jämför priser" },
};

export interface List {
  id: string;
  title: string;
  type: ListType;
  emoji: string;
  owner_name: string;
  created_at: number;
}

export interface Item {
  id: string;
  list_id: string;
  title: string;
  note: string;
  quantity: number;
  url: string;
  image: string;
  description: string;
  summary: string;
  brand: string;
  gtin: string;
  category: string;
  rating: number | null;
  review_count: number | null;
  price: number | null;
  currency: string;
  priority: number;
  checked: boolean;
  checked_by: string;
  reserved_by: string;
  created_by: string;
  created_at: number;
  comment_count?: number;
}

export interface Comment {
  id: string;
  item_id: string;
  author: string;
  body: string;
  secret: boolean;
  created_at: number;
}

export interface Offer {
  id: string;
  item_id: string;
  source: string;
  merchant: string;
  title: string;
  price: number | null;
  currency: string;
  link: string;
  thumbnail: string;
  rating: number | null;
  reviews: number | null;
  fetched_at: number;
}
