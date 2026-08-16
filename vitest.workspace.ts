import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*',
  'adapters/*',
  'create-ranu',
  'tests/*'
])
