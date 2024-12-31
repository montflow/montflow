import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, {
  target: document.getElementById("@danstack/tetris")!,
});

export default app;
