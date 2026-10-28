/** The telemetry data directory without its trailing slash. */
export const trim = (directory: string): string => directory.replace(/\/+$/u, '');

/** Join a file name onto the telemetry data directory. */
export const file = (directory: string, name: string): string => `${trim(directory)}/${name}`;
