/** @jsxImportSource @opentui/solid */
import { testRender } from '@opentui/solid';
import { describe, test } from 'bun:test';
import { InfoPanel } from '../info-panel.js';
import { Panel, PanelMessage } from '../panel.js';
import { ProfilesPanel } from '../profiles-panel.js';
import { SkillsPanel } from '../skills-panel.js';

const WIDTH = 100;
const HEIGHT = 40;

const skillRow = (id: string) => ({
  id,
  name: id,
  description: '',
  groups: [],
  dependencies: [],
  body: '',
});

const profileRow = (id: string) => ({
  id,
  name: id,
  description: '',
  model: '',
  skills: [],
  instructions: '',
  checklist: [],
});

describe('full grid probe', () => {
  test('dump grid frame', async () => {
    const setup = await testRender(
      () => (
        <box width={WIDTH} height={HEIGHT} flexDirection="column">
          <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} padding={1}>
            <box flexDirection="column" flexGrow={2.4} flexBasis={0} minHeight={0} gap={1}>
              <Panel title="[i] Info" selected={false} grow={1}>
                <InfoPanel info={{ name: 'main', root: '/r', branch: 'main', clean: true }} />
              </Panel>
              <Panel title="[s] Skills" selected={false} grow={2}>
                <SkillsPanel
                  loading={false}
                  installing={false}
                  installed
                  rows={[skillRow('a'), skillRow('b')]}
                  highlight={0}
                  total={2}
                  query=""
                  searching={false}
                  capacity={5}
                  selected={false}
                />
              </Panel>
              <Panel title="[p] Prompts" selected={false} grow={1}>
                <PanelMessage message="[unimplemented]" />
              </Panel>
            </box>
            <box flexDirection="column" flexGrow={5} flexBasis={0} minHeight={0} gap={1}>
              <Panel title="[r] Runs" selected={false} grow={3}>
                <PanelMessage message="[unimplemented]" />
              </Panel>
              <Panel title="[f] Profiles" selected grow={2}>
                <ProfilesPanel
                  loading={false}
                  installing={false}
                  installed
                  rows={[profileRow('a'), profileRow('b')]}
                  highlight={0}
                  total={2}
                  query=""
                  searching={false}
                  capacity={5}
                  selected
                />
              </Panel>
            </box>
          </box>
        </box>
      ),
      { width: WIDTH, height: HEIGHT },
    );
    await setup.renderOnce();
    const rows = setup.captureCharFrame().split('\n');
    rows.forEach((line, i) => console.log(`${String(i).padStart(2)}|${line}`));
    setup.renderer.destroy();
  });
});
