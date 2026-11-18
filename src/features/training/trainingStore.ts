import { createPersistentStore, usePersistentStore } from '../../lib/persistentStore'
import { STORAGE_PREFIX } from '../../lib/storage'
import { emptyProgress, recordFailure, recordSolved, sanitizeProgress, type TrainingProgress } from './trainingModel'

export const TRAINING_KEY = `${STORAGE_PREFIX}training:v1`

export const trainingStore = createPersistentStore<TrainingProgress>({
  key: TRAINING_KEY,
  fallback: emptyProgress,
  sanitize: sanitizeProgress,
})

export function useTrainingProgress(): TrainingProgress {
  return usePersistentStore(trainingStore)
}

export const markFailure = (id: string) => trainingStore.set((progress) => recordFailure(progress, id, Date.now()))
export const markSolved = (id: string, assisted: boolean) => trainingStore.set((progress) => recordSolved(progress, id, assisted, Date.now()))
export const resetTraining = () => trainingStore.set(emptyProgress())
