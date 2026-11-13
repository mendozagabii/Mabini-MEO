/** No artificial delay: progress stays visible for the actual network operation. */
export const PROJECT_SAVE_MINIMUM_MS = 0;

export function startProjectSaveDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, PROJECT_SAVE_MINIMUM_MS));
}
