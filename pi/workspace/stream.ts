/**
 * Kind of live stream content an agent can emit: visible assistant text or
 * reasoning/thinking. Shared by the agent runner and any consumer that wants
 * to render one agent's stream live.
 */
export type StreamKind = 'text' | 'thinking';
