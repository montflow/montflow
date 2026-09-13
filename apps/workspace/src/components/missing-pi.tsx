import { useKeyboard, useRenderer } from '@opentui/solid';
import { palette } from './palette.js';

/**
 * Startup gate page: the `pi` CLI did not resolve, so the dashboard
 * cannot drive anything. Full-screen install pointer, `q` quits.
 * @returns missing-pi element
 */
export const MissingPi = () => {
  const renderer = useRenderer();

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape' || key.name === 'enter') renderer.destroy();
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={palette.bg}
      alignItems="center"
      justifyContent="center"
      gap={1}
    >
      <text style={{ fg: palette.bad }}>pi is not installed.</text>
      <text style={{ fg: palette.text }}>Install pi, then restart the dashboard.</text>
      <text style={{ fg: palette.dim }}>npm install -g @earendil-works/pi-coding-agent</text>
      <text style={{ fg: palette.dim }}>q quit</text>
    </box>
  );
};
