/// <reference types="astro/client" />

import type { Theme } from "lib:shared";

declare global {
  namespace App {
    interface Locals {
      theme: Theme;
    }
  }
}
