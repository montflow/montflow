import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Pi extension entry: notification adapters register here. Boilerplate
 * registers no commands yet — adapters (phone, push, desktop) attach in
 * later iterations.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piNotificationsExtension(pi: ExtensionAPI): Promise<void> {
  void pi;
  return Promise.resolve();
}
