import type { Menu } from "lib/commerce/types";

// Menus are a fixed part of the storefront's navigation, not store data, so
// they stay a constant instead of a table.
export type MenuHandle =
  "next-js-frontend-header-menu" | "next-js-frontend-footer-menu";

export const MENUS = {
  "next-js-frontend-header-menu": [
    { title: "All", path: "/search" },
    { title: "Apparel", path: "/search/apparel" },
    { title: "Accessories", path: "/search/accessories" },
    { title: "Desk", path: "/search/desk" },
  ],
  "next-js-frontend-footer-menu": [
    { title: "Home", path: "/" },
    { title: "About", path: "/about" },
    { title: "FAQ", path: "/faq" },
    { title: "Shipping & Returns", path: "/shipping-returns" },
  ],
} satisfies Record<MenuHandle, Menu[]>;
