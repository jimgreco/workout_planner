export const BUILD_INFO = {
  version: import.meta.env.VITE_APP_VERSION || '0.0.0',
  commit: import.meta.env.VITE_GIT_COMMIT || 'local',
};

export function buildLabel() {
  return `web ${BUILD_INFO.version} (${BUILD_INFO.commit})`;
}
