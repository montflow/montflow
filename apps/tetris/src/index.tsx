/* @refresh reload */
import * as Solid from "solid-js";
import { render } from "solid-js/web";
import { Styles } from "./styles";
import { Tetris } from "./tetris";

const root = document.getElementById("root");

const Root: Solid.Component = () => {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        background: "oklch(26.9% 0.042 216.315)",
        ...Styles.flexCenter,
      }}
    >
      <Tetris />
    </main>
  );
};

render(() => <Root />, root!);
