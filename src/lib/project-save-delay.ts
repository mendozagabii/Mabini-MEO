/** Keep the project save/update progress visible for at least three seconds. */
export const PROJECT_SAVE_MINIMUM_MS = 3000;

export function startProjectSaveDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, PROJECT_SAVE_MINIMUM_MS));
}
