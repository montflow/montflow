/**
 * Pi extended-thinking level for an agent role: `off` disables thinking,
 * `minimal`…`max` scale the reasoning effort. The level is clamped to the
 * model's capabilities by pi at session creation (`thinkingLevelMap`), so an
 * unsupported level never fails the run — it silently maps to the nearest
 * supported one. Omitted (undefined) means "pi default" (`medium` clamped to
 * the model).
 */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
