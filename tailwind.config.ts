import type { Config } from "tailwindcss";
import { nextui } from "@nextui-org/react";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    nextui({
      themes: {
        light: {
          colors: {
            background: "#f4f4f5", // Màu nền dịu hơn thay vì trắng tinh
            foreground: "#11181C", // Text đen dịu mắt
            content1: "#ffffff", // Giữ nền trắng tinh cho các Card để tạo chiều sâu
          },
        },
      },
    }),
  ],
};
export default config;
